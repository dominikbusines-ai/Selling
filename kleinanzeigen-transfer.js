// Exports a draft; only the listed flag is saved after a confirmed handoff.
async function prepareKleinanzeigenDraft(item, button) {
  if (!item || item.sold || itemSection(item) !== 'selling') return;
  if (document.documentElement.dataset.sellingBridge !== '1') {
    openManualListing(item, button);
    return;
  }
  if (!confirm(`Entwurf für „${item.name}“ an Kleinanzeigen übergeben?\n\nÜbertragen werden Name, Beschreibung, Preis und das vorhandene Bild. Nach bestätigter Übergabe wird der Artikel hier als „Inseriert“ markiert. Bitte danach Kategorie, Versand und alle Angaben prüfen. Die Veröffentlichung bei Kleinanzeigen bestätigen Sie selbst.`)) return;
  const ownerId = state.session?.user.id || null;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Entwurf vorbereiten …';
  try {
    refreshCategoryOwner();
    if (!listingCategoryCache[listingCategoryKey(item)]) await scheduleListingCategories();
    const recommendation = listingCategoryCache[listingCategoryKey(item)];
    if (!recommendation) throw new Error('Die KI-Kategorie ist noch nicht verfügbar. Bitte die Empfehlung am Artikel abwarten und dann erneut inserieren.');
    const categoryPath = recommendation.category ? recommendation.category.split(' > ') : [];
    let image = null;
    if (item.image || item.imagePath) {
      let source = item.image;
      if (item.imagePath && supabaseClient) source = await signedImageUrl(item.imagePath);
      const response = await fetch(source, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Das Bild konnte nicht geladen werden. Es wurde kein Entwurf geöffnet.');
      const blob = await response.blob();
      if (blob.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type.split(';')[0])) {
        throw new Error('Für die Übergabe bitte ein JPG-, PNG- oder WebP-Bild bis 5 MB verwenden. Ihr vorhandenes Bild wurde nicht verändert.');
      }
      image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
        reader.readAsDataURL(blob);
      });
    }
    const requestId = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
      const receive = (event) => {
        if (event.source !== window || event.origin !== location.origin) return;
        let result;
        try { result = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        if (result?.type !== 'SELLING_DRAFT_RESULT' || result.requestId !== requestId) return;
        cleanup();
        result.ok ? resolve() : reject(new Error(result.error || 'Übergabe fehlgeschlagen.'));
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Keine Bestätigung der Erweiterung. Bitte geöffnete Kleinanzeigen-Tabs prüfen, bevor Sie erneut übertragen.')); }, 15000);
      window.addEventListener('message', receive);
      window.postMessage({ type: 'SELLING_PREPARE_DRAFT', requestId, draft: { name: item.name, description: item.description || '', price: Number(item.price), image, categoryPath } }, location.origin);
    });
    try {
      await markListingTransferred(item.id, ownerId);
    } catch (error) {
      alert(`Der Entwurf wurde übergeben, aber „Inseriert“ konnte nicht gespeichert werden. Bitte den Status manuell setzen; nicht erneut übertragen.\n\n${error.message || 'Speichern fehlgeschlagen.'}`);
    }
  } catch (error) { alert(error.message || 'Übergabe nicht möglich. Ihr Artikel bleibt unverändert.'); }
  finally { button.disabled = false; button.textContent = previous; }
}

async function markListingTransferred(itemId, ownerId) {
  if ((state.session?.user.id || null) !== ownerId) throw new Error('Das angemeldete Konto hat sich geändert.');
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || item.sold || itemSection(item) !== 'selling' || item.listed) return;
  if (ownerId) {
    // Update only this flag, never stale descriptions, photos, prices or sold status.
    const { data, error } = await supabaseClient.from('selling_items')
      .update({ listed: true, updated_at: new Date().toISOString() })
      .eq('id', itemId).eq('user_id', ownerId).eq('sold', false)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Der Artikel wurde nicht aktualisiert. Bitte den aktuellen Status prüfen.');
    if ((state.session?.user.id || null) !== ownerId) return;
  }
  const nextItems = state.items.map((entry) => entry.id === itemId ? { ...entry, listed: true } : entry);
  // Persist before updating the UI; a storage failure must not appear successful.
  if (!ownerId) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
  state.items = nextItems;
  if (state.editingItemId === itemId) document.querySelector('#item-listed').checked = true;
  render();
}

// Clipboard-only fallback: never changes an item or sends it to another service.
function openManualListing(item, trigger) {
  if (document.querySelector('.listing-copy-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal listing-copy-dialog';
  dialog.setAttribute('aria-labelledby', 'listing-copy-title');
  dialog.innerHTML = `<button type="button" class="close-button" aria-label="Schließen">×</button>
    <h2 id="listing-copy-title">Für Kleinanzeigen</h2>
    <p class="listing-copy-hint">Gespeicherte Angaben kopieren und bei Kleinanzeigen einfügen.</p>
    <div class="listing-copy-actions"></div>
    <p class="listing-copy-status" role="status" aria-live="polite"></p>
    <textarea class="listing-copy-manual" aria-label="Text zum manuellen Kopieren" readonly hidden></textarea>
    <a class="listing-copy-link" href="https://www.kleinanzeigen.de/p-anzeige-aufgeben.html" target="_blank" rel="noopener noreferrer">Kleinanzeigen öffnen ↗</a>
    <p class="listing-copy-hint">Bild und Kategorie dort auswählen. Versand: „Nur Abholung“.</p>`;
  const status = dialog.querySelector('.listing-copy-status');
  const manual = dialog.querySelector('textarea');
  const fields = [
    ['Titel', item.name],
    ['Beschreibung', item.description || ''],
    ['Preis', Number(item.price).toFixed(2).replace('.', ',')]
  ];
  for (const [label, value] of fields) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button-quiet';
    button.textContent = label;
    button.setAttribute('aria-label', `${label} kopieren`);
    button.disabled = !value;
    button.addEventListener('click', async () => {
      manual.hidden = true;
      try {
        // Called directly in the tap handler for iOS clipboard permission.
        await navigator.clipboard.writeText(value);
        status.textContent = `${label} kopiert.`;
      } catch {
        if (!dialog.open) return;
        manual.value = value;
        manual.hidden = false;
        manual.focus({ preventScroll: true });
        manual.select();
        manual.setSelectionRange(0, value.length);
        status.textContent = 'Bitte den markierten Text manuell kopieren.';
      }
    });
    dialog.querySelector('.listing-copy-actions').append(button);
  }
  const ownsScrollLock = !document.documentElement.classList.contains('modal-open');
  dialog.querySelector('.close-button').addEventListener('click', () => dialog.close());
  // Keep Escape from closing the underlying edit form as well.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (ownsScrollLock) unlockPageScroll();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  if (ownsScrollLock) lockPageScroll();
  dialog.showModal();
}
