(async () => {
  const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
  const result = await extensionApi.runtime.sendMessage({ type: 'read' });
  if (!result?.ok) return;
  const draft = result.draft;
  const host = document.createElement('aside');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>:host{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px));font:14px/1.5 system-ui;color:#172b24}section{background:white;border:2px solid #214d40;border-radius:12px;padding:16px;box-shadow:0 4px 24px #0003;max-height:65vh;overflow:auto}button{padding:10px;margin:8px 6px 0 0;cursor:pointer}p{margin:8px 0}</style><section><strong>Selling: Entwurf vorbereiten</strong><p id="name"></p><p>Formular bitte öffnen und ggf. anmelden bzw. Kategorie wählen. Die automatische Zuordnung ist noch nicht am Live-Formular bestätigt.</p><p id="status" role="status"></p><button id="fill">Daten eintragen / ergänzen</button><button id="close">Übergabe beenden</button><p>Es wird nichts veröffentlicht. Bitte Preisart, Kategorie, Versand, Standort und alle Angaben selbst prüfen.</p></section>`;
  shadow.querySelector('#name').textContent = draft.name;
  const categoryInfo = document.createElement('p');
  categoryInfo.textContent = draft.categoryPath?.length ? `KI-Empfehlung: ${draft.categoryPath.join(' > ')}` : 'Keine KI-Kategorie übergeben.';
  shadow.querySelector('#name').after(categoryInfo);
  document.documentElement.append(host);
  const applied = new WeakSet();
  let categoryAttempted = false;
  let categoryStatus = '';
  let formObserver;
  let formTimer;
  const transferAbort = new AbortController();
  let imageTransferred = false;
  function imageField() {
    const fields = [...document.querySelectorAll('input[type="file"]')].filter((field) =>
      !field.disabled && (!field.accept || /image|\.jpe?g|\.png|\.webp/i.test(field.accept)));
    // Hidden upload inputs are common. Never guess when multiple inputs qualify.
    return fields.length === 1 ? fields[0] : null;
  }
  function waitForImageField() {
    if (transferAbort.signal.aborted) return Promise.resolve(null);
    const field = imageField();
    if (field) return Promise.resolve(field);
    return new Promise((resolve) => {
      const finish = (field) => {
        observer.disconnect(); clearTimeout(timer);
        transferAbort.signal.removeEventListener('abort', cancel);
        resolve(field);
      };
      const cancel = () => finish(null);
      const observer = new MutationObserver(() => {
        const field = imageField();
        if (field) finish(field);
      });
      const timer = setTimeout(cancel, 20000);
      transferAbort.signal.addEventListener('abort', cancel, { once: true });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'accept', 'type'] });
    });
  }
  async function fillImage() {
    if (!draft.image) return 'Kein Bild im Artikel hinterlegt';
    if (imageTransferred) return 'Bild: bereits übergeben – Upload bitte kontrollieren';
    shadow.querySelector('#status').textContent = 'Warte auf das Bild-Uploadfeld …';
    const field = await waitForImageField();
    if (!host.isConnected || transferAbort.signal.aborted) return 'Bildübergabe beendet';
    if (!field) return 'Bild: Uploadfeld nicht eindeutig gefunden. Sobald es bereit ist, „Daten eintragen / ergänzen“ erneut klicken.';
    if (field.files.length) return 'Bild: vorhandene Bildauswahl bleibt unverändert';
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(draft.image);
    if (!match) return 'Bild: Format nicht unterstützt';
    // Decode locally: no fetch(data:) dependency on the target site's CSP.
    const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
    const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
    const files = new DataTransfer();
    files.items.add(new File([bytes], `artikel.${extension}`, { type: match[1] }));
    field.files = files.files;
    if (field.files.length !== 1) return 'Bild: Auswahl wurde nicht übernommen – bitte manuell hinzufügen';
    imageTransferred = true;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return 'Bild: an Kleinanzeigen übergeben – bitte warten, bis die Bildvorschau erscheint';
  }
  function watchForForm() {
    formObserver?.disconnect();
    clearTimeout(formTimer);
    formObserver = new MutationObserver(() => {
      if (!fieldsFor(['titel', 'title', 'adtitle', 'ad-title']).length) return;
      formObserver.disconnect();
      clearTimeout(formTimer);
      if (!shadow.querySelector('#fill').disabled) fill();
    });
    formObserver.observe(document.body, { childList: true, subtree: true });
    formTimer = setTimeout(() => formObserver.disconnect(), 60000);
  }
  const normalize = (text) => String(text || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\s:*]+$/g, '');
  const visible = (element) => !element.disabled && !element.readOnly && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  function fieldsFor(names, textarea = false) {
    return [...document.querySelectorAll(textarea ? 'textarea' : 'input:not([type]),input[type="text"],input[type="number"],input[type="tel"]')].filter((element) => visible(element) && [element.name, element.id, element.getAttribute('aria-label'), ...[...(element.labels || [])].map((label) => label.textContent)].some((label) => names.includes(normalize(label))));
  }
  function fillText(names, value, title, textarea = false) {
    const matches = fieldsFor(names, textarea);
    if (matches.length !== 1) return `${title}: nicht eindeutig gefunden – bitte manuell prüfen`;
    const field = matches[0];
    if (applied.has(field)) return `${title}: bereits übertragen`;
    if (field.value.trim()) return `${title}: vorhandener Inhalt bleibt unverändert`;
    if (title === 'Preis') value = field.type === 'number' ? String(draft.price) : String(draft.price).replace('.', ',');
    if (field.maxLength > 0 && value.length > field.maxLength) return `${title}: zu lang, bitte kürzen und manuell eintragen`;
    const prototype = textarea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    if (field.value !== value) return `${title}: Eingabe nicht übernommen – bitte manuell prüfen`;
    applied.add(field);
    return `${title}: eingetragen – bitte prüfen`;
  }
  function pickupOnly() {
    const labels = [...document.querySelectorAll('label')].filter((label) => normalize(label.textContent) === 'nur abholung' && label.getClientRects().length);
    const radios = labels.map((label) => label.control).filter((field) => field?.type === 'radio' && !field.disabled);
    if (radios.length === 1) {
      if (!applied.has(radios[0])) { radios[0].click(); applied.add(radios[0]); }
      return radios[0].checked ? 'Nur Abholung: ausgewählt' : 'Abholung wurde geändert – bitte prüfen';
    }
    const selects = [...document.querySelectorAll('select')].filter(visible).map((select) => ({ select, options: [...select.options].filter((option) => normalize(option.textContent) === 'nur abholung') })).filter((entry) => entry.options.length === 1);
    if (selects.length === 1) {
      const { select, options } = selects[0];
      if (!applied.has(select)) { select.value = options[0].value; select.dispatchEvent(new Event('change', { bubbles: true })); applied.add(select); }
      return select.value === options[0].value ? 'Nur Abholung: ausgewählt' : 'Abholung wurde geändert – bitte prüfen';
    }
    return 'Nur Abholung: Auswahl nicht eindeutig gefunden – bitte selbst auswählen';
  }
  async function fill() {
    const button = shadow.querySelector('#fill');
    button.disabled = true;
    const notes = [];
    try {
      if (!categoryAttempted) {
        const selection = await selectSellingCategory(draft.categoryPath, () => host.isConnected);
        if (selection.picker) {
          categoryAttempted = true;
          categoryStatus = selection.text;
          notes.push(selection.text);
          if (host.isConnected) watchForForm();
          return;
        }
      }
      if (sellingCategoryHeadings().length) {
        notes.push(categoryStatus || 'Bitte zuerst die Kategorie auswählen und „Weiter“ klicken. Die Artikelfelder erscheinen erst danach.');
        if (host.isConnected) watchForForm();
        return;
      }
      notes.push(fillText(['titel', 'title', 'adtitle', 'ad-title'], draft.name, 'Titel'));
      notes.push(fillText(['beschreibung', 'description', 'addescription', 'ad-description'], draft.description, 'Beschreibung', true));
      notes.push(fillText(['preis', 'preis in €', 'price', 'adprice', 'ad-price', 'priceamount', 'price.amount'], String(draft.price), 'Preis'));
      notes.push(pickupOnly());
      notes.push(await fillImage());
    } catch { notes.push('Formular konnte nicht vollständig befüllt werden. Bitte manuell prüfen.'); }
    finally { shadow.querySelector('#status').textContent = notes.join(' · '); button.disabled = false; }
  }
  shadow.querySelector('#fill').addEventListener('click', fill);
  shadow.querySelector('#close').addEventListener('click', async () => { transferAbort.abort(); formObserver?.disconnect(); clearTimeout(formTimer); host.remove(); await extensionApi.runtime.sendMessage({ type: 'discard' }); });
  // Only explicit category/pickup options may be clicked; never publish or handle CAPTCHA.
  await fill();
})();
