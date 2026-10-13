const batchListing = { active: false, busy: false, ids: new Set(), owner: null };

function updateBatchListingControls() {
  const owner = state.session?.user.id || null;
  if (batchListing.owner !== owner) { batchListing.ids.clear(); batchListing.owner = owner; }
  for (const id of batchListing.ids) {
    if (!state.items.some((item) => item.id === id && !item.sold && !item.listed && itemSection(item) === 'selling')) batchListing.ids.delete(id);
  }
  document.querySelector('#batch-listing-bar').hidden = state.section !== 'selling';
  const toggle = document.querySelector('#batch-toggle');
  toggle.textContent = batchListing.active ? 'Auswahl beenden' : 'Mehrere inserieren';
  toggle.setAttribute('aria-pressed', String(batchListing.active));
  toggle.disabled = batchListing.busy;
  const start = document.querySelector('#batch-start');
  start.hidden = !batchListing.active;
  start.disabled = batchListing.busy || !batchListing.ids.size;
  start.textContent = `${batchListing.ids.size}/5 Entwürfe vorbereiten`;
  document.querySelectorAll('.batch-item-select input').forEach((input) => {
    input.disabled = batchListing.busy || (!input.checked && batchListing.ids.size >= 5);
  });
}

function addBatchListingControl(card, item) {
  if (!batchListing.active || item.sold || item.listed || itemSection(item) !== 'selling') return;
  const label = document.createElement('label');
  label.className = 'batch-item-select';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', `${item.name} für Entwurf auswählen`);
  input.checked = batchListing.ids.has(item.id);
  input.disabled = batchListing.busy || (!input.checked && batchListing.ids.size >= 5);
  input.addEventListener('change', () => {
    if (input.checked && batchListing.ids.size < 5) batchListing.ids.add(item.id);
    else { batchListing.ids.delete(item.id); input.checked = false; }
    updateBatchListingControls();
  });
  label.append(input); card.prepend(label);
}

document.querySelector('#batch-toggle').addEventListener('click', () => {
  if (document.documentElement.dataset.sellingBridge !== '1') {
    alert('Die Mehrfachübergabe benötigt die Selling-Erweiterung im PC-Browser. Auf dem Handy bitte einzeln über „Inserieren“ kopieren.'); return;
  }
  batchListing.active = !batchListing.active;
  batchListing.ids.clear();
  document.querySelector('#batch-status').textContent = '';
  render();
});
document.querySelector('#batch-start').addEventListener('click', async () => {
  if (batchListing.busy || document.documentElement.dataset.sellingBridge !== '1') return;
  updateBatchListingControls();
  const ids = [...batchListing.ids].slice(0, 5);
  if (!ids.length || !confirm(`${ids.length} Entwürfe in eigenen Kleinanzeigen-Tabs vorbereiten?\nBestätigte Übergaben werden als „Inseriert“ markiert. Nichts wird veröffentlicht. Tabs offen lassen und Bild, Kategorie sowie alle Angaben prüfen; Formulare sind nicht zwingend dauerhaft gespeichert.`)) return;
  const owner = state.session?.user.id || null;
  const status = document.querySelector('#batch-status');
  batchListing.busy = true;
  updateBatchListingControls();
  let completed = 0;
  try {
    for (const id of ids) {
      if ((state.session?.user.id || null) !== owner) throw new Error('Konto gewechselt.');
      const item = state.items.find((item) => item.id === id);
      if (!item || item.sold || item.listed || itemSection(item) !== 'selling') throw new Error('Ein ausgewählter Artikel wurde zwischenzeitlich geändert.');
      status.textContent = `${completed}/${ids.length} übergeben · ${item.name}`;
      // Separate button state avoids interfering with the persistent batch controls.
      const saved = await prepareKleinanzeigenDraft(item, document.createElement('button'), { batch: true });
      if (saved === undefined) throw new Error('Übergabe nicht bestätigt.');
      batchListing.ids.delete(id);
      completed++;
      if (!saved) throw new Error('Entwurf übergeben, aber Status nicht gespeichert. Bitte „Inseriert“ manuell setzen.');
    }
    status.textContent = `${completed}/${ids.length} Entwürfe übergeben. In den geöffneten Tabs prüfen.`;
  } catch (error) {
    status.textContent = `${completed}/${ids.length} bestätigt. Gestoppt: ${error.message} Geöffnete Tabs vor einem neuen Versuch prüfen.`;
  } finally { batchListing.busy = false; render(); }
});

// Exports a draft; only the listed flag is saved after a confirmed handoff.
async function prepareKleinanzeigenDraft(item, button, options = {}) {
  if (batchListing.busy && !options.batch) return;
  if (!item || item.sold || itemSection(item) !== 'selling') return;
  if (document.documentElement.dataset.sellingBridge !== '1') {
    openManualListing(item, button);
    return;
  }
  if (!options.batch && !confirm(`Entwurf für „${item.name}“ an Kleinanzeigen übergeben?\n\nÜbertragen werden Name, Beschreibung, Preis und das vorhandene Bild. Nach bestätigter Übergabe wird der Artikel hier als „Inseriert“ markiert. Bitte danach Kategorie, Versand und alle Angaben prüfen. Die Veröffentlichung bei Kleinanzeigen bestätigen Sie selbst.`)) return;
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
      return true;
    } catch (error) {
      if (!options.batch) alert(`Der Entwurf wurde übergeben, aber „Inseriert“ konnte nicht gespeichert werden. Bitte den Status manuell setzen; nicht erneut übertragen.\n\n${error.message || 'Speichern fehlgeschlagen.'}`);
      return false;
    }
  } catch (error) { if (options.batch) throw error; alert(error.message || 'Übergabe nicht möglich. Ihr Artikel bleibt unverändert.'); }
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
