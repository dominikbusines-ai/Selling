// Read-only export. No Supabase writes, item deletion, or publication takes place here.
async function prepareKleinanzeigenDraft(item, button) {
  if (!item || item.sold || itemSection(item) !== 'selling') return;
  if (document.documentElement.dataset.sellingBridge !== '1') {
    alert('Bitte zuerst die Selling-Erweiterung in Chrome oder Edge am PC installieren. Die Anleitung liegt im Projekt unter kleinanzeigen-extension/README.md. Auf dem iPhone wird diese Erweiterung nicht unterstützt.');
    return;
  }
  if (!confirm(`Entwurf für „${item.name}“ an Kleinanzeigen übergeben?\n\nÜbertragen werden Name, Beschreibung, Preis und das vorhandene Bild. Bitte danach Kategorie, Versand und alle Angaben prüfen. Es wird nichts automatisch veröffentlicht und Ihr Eintrag bleibt unverändert.`)) return;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Entwurf vorbereiten …';
  try {
    let image = null;
    if (item.image) {
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
        if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'SELLING_DRAFT_RESULT' || event.data.requestId !== requestId) return;
        cleanup();
        event.data.ok ? resolve() : reject(new Error(event.data.error || 'Übergabe fehlgeschlagen.'));
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Keine Bestätigung der Erweiterung. Bitte geöffnete Kleinanzeigen-Tabs prüfen, bevor Sie erneut übertragen.')); }, 15000);
      window.addEventListener('message', receive);
      window.postMessage({ type: 'SELLING_PREPARE_DRAFT', requestId, draft: { name: item.name, description: item.description || '', price: Number(item.price), image } }, location.origin);
    });
  } catch (error) { alert(error.message || 'Übergabe nicht möglich. Ihr Artikel bleibt unverändert.'); }
  finally { button.disabled = false; button.textContent = previous; }
}
