const SUPABASE_URL = 'https://kfriqckayjehbigvrnys.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qe872JZtouSldyBjzwjR6Q_NpGaTyyq';
const STORAGE_KEY = 'verkaufsliste-items-v1';
const IMAGE_BUCKET = 'selling-images';
const signedImageCache = new Map();
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    })
  : null;

const state = {
  items: loadLocalItems(),
  session: null,
  imageData: '',
  imageFile: null,
  imageReadPromise: null,
  imagePath: '',
  removedImagePath: '',
  authMode: 'login',
  syncTimer: null,
  aiItemId: null,
  aiProduct: null,
  aiResult: '',
  aiTask: '',
  aiRecommendedPrice: null,
  aiReturnToForm: false,
  compactView: localStorage.getItem('verkaufsliste-compact-view') === 'true',
  editingItemId: '',
  busy: false
};

const elements = {
  grid: document.querySelector('#item-grid'), empty: document.querySelector('#empty-state'), total: document.querySelector('#total-value'), count: document.querySelector('#item-count'),
  backdrop: document.querySelector('#modal-backdrop'), form: document.querySelector('#item-form'), formTitle: document.querySelector('#form-title'), formEyebrow: document.querySelector('#form-eyebrow'), error: document.querySelector('#form-error'),
  id: document.querySelector('#item-id'), name: document.querySelector('#item-name'), price: document.querySelector('#item-price'), description: document.querySelector('#item-description'), image: document.querySelector('#item-image'), imageUploadButton: document.querySelector('#image-upload-button'), preview: document.querySelector('#upload-preview'), removeImage: document.querySelector('#remove-image-button'), deleteItem: document.querySelector('#delete-item-button'), formAi: document.querySelector('#open-ai-from-form'),
  syncStatus: document.querySelector('#sync-status'), compactViewButton: document.querySelector('#compact-view-button'), soldValue: document.querySelector('#sold-value'), soldCount: document.querySelector('#sold-count'), soldValueButton: document.querySelector('#sold-value-button'), soldBackdrop: document.querySelector('#sold-backdrop'), soldSummary: document.querySelector('#sold-summary'), soldList: document.querySelector('#sold-list'), authButton: document.querySelector('#auth-button'), authBackdrop: document.querySelector('#auth-backdrop'), authForm: document.querySelector('#auth-form'), authTitle: document.querySelector('#auth-title'), authEyebrow: document.querySelector('#auth-eyebrow'), authIntro: document.querySelector('#auth-intro'), authEmail: document.querySelector('#auth-email'), authPassword: document.querySelector('#auth-password'), authSubmit: document.querySelector('#auth-submit'), authError: document.querySelector('#auth-error'), authSwitch: document.querySelector('#auth-switch'),
  aiBackdrop: document.querySelector('#ai-backdrop'), aiTitle: document.querySelector('#ai-title'), aiContext: document.querySelector('#ai-product-context'), aiQuestion: document.querySelector('#ai-question'), aiAsk: document.querySelector('#ai-ask-button'), aiResultWrap: document.querySelector('#ai-result-wrap'), aiResult: document.querySelector('#ai-result'), aiApply: document.querySelector('#ai-apply-button'), aiError: document.querySelector('#ai-error'),
  sold: document.querySelector('#item-sold'), soldPriceField: document.querySelector('#sold-price-field'), soldPrice: document.querySelector('#item-sold-price')
};

function loadLocalItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveLocalItems() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }

function setSyncStatus(text, mode = '') {
  elements.syncStatus.textContent = text;
  elements.syncStatus.classList.toggle('is-online', mode === 'online');
  elements.syncStatus.classList.toggle('is-error', mode === 'error');
}

function formatDate(value) {
  try { return dateFormat.format(new Date(value)); } catch { return ''; }
}

function render() {
  elements.grid.innerHTML = '';
  elements.grid.classList.toggle('compact-view', state.compactView);
  elements.empty.hidden = state.items.length > 0;
  const availableItems = state.items.filter((item) => !item.sold);
  const soldItems = state.items.filter((item) => item.sold);
  const total = availableItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const soldTotal = soldItems.reduce((sum, item) => sum + Number(item.soldPrice ?? item.price ?? 0), 0);
  elements.total.textContent = money.format(total);
  elements.count.textContent = `${availableItems.length} ${availableItems.length === 1 ? 'Gegenstand' : 'Gegenstände'} verfügbar`;
  elements.soldValue.textContent = money.format(soldTotal);
  elements.soldCount.textContent = `${soldItems.length} verkauft · Details öffnen`;

  state.items.forEach((item) => {
    const card = document.querySelector('#item-template').content.cloneNode(true);
    const image = card.querySelector('.item-image');
    const imageWrap = card.querySelector('.item-image-wrap');
    card.querySelector('.item-name').textContent = item.name;
    card.querySelector('.item-description').textContent = item.description || 'Keine Beschreibung hinterlegt.';
    const displayPrice = item.sold ? Number(item.soldPrice ?? item.price) : Number(item.price);
    card.querySelector('.item-price').textContent = item.sold ? `Verkauft: ${money.format(displayPrice)}` : money.format(displayPrice);
    card.querySelector('.compact-price').textContent = money.format(displayPrice);
    card.querySelector('.item-date').textContent = `angelegt am ${formatDate(item.createdAt)}`;
    if (item.image) {
      image.src = item.image; image.alt = `Bild von ${item.name}`; card.querySelector('.no-image').hidden = true;
      image.addEventListener('error', () => { image.hidden = true; const fallback = card.querySelector('.no-image'); fallback.hidden = false; fallback.textContent = 'Bild konnte nicht geladen werden'; });
    } else { image.hidden = true; }
    card.querySelector('.edit-button').addEventListener('click', () => openForm(item));
    card.querySelector('.more-button').addEventListener('click', () => openForm(item));
    card.querySelector('.ai-button').addEventListener('click', () => openAi(item));
    card.querySelector('.item-card').classList.toggle('is-compact', state.compactView);
    if (state.compactView) {
      imageWrap.tabIndex = 0;
      imageWrap.setAttribute('role', 'button');
      imageWrap.setAttribute('aria-label', `${item.name} bearbeiten`);
      imageWrap.addEventListener('click', () => openForm(item));
      imageWrap.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openForm(item); }
      });
    }
    elements.grid.append(card);
  });
}

function updateViewToggle() {
  elements.compactViewButton.textContent = state.compactView ? 'Detailansicht' : 'Kompaktansicht';
  elements.compactViewButton.setAttribute('aria-pressed', String(state.compactView));
}

function toggleCompactView() {
  state.compactView = !state.compactView;
  localStorage.setItem('verkaufsliste-compact-view', String(state.compactView));
  updateViewToggle(); render();
}

function openSoldList() {
  const soldItems = state.items.filter((item) => item.sold);
  const total = soldItems.reduce((sum, item) => sum + Number(item.soldPrice ?? item.price ?? 0), 0);
  elements.soldSummary.textContent = `${soldItems.length} ${soldItems.length === 1 ? 'Gegenstand' : 'Gegenstände'} · ${money.format(total)} Verkaufserlös`;
  elements.soldList.replaceChildren();
  if (!soldItems.length) {
    const empty = document.createElement('div'); empty.className = 'sold-empty'; empty.textContent = 'Noch keine verkauften Gegenstände eingetragen.'; elements.soldList.append(empty);
  } else {
    soldItems.forEach((item) => {
      const row = document.createElement('div'); row.className = 'sold-row';
      const details = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = item.name;
      const date = document.createElement('small'); date.textContent = item.soldAt ? `Verkauft am ${formatDate(item.soldAt)}` : 'Verkauft';
      details.append(name, date);
      const price = document.createElement('span'); price.className = 'sold-row-price'; price.textContent = money.format(Number(item.soldPrice ?? item.price ?? 0));
      row.append(details, price); elements.soldList.append(row);
    });
  }
  elements.soldBackdrop.hidden = false; lockPageScroll();
}

function closeSoldList() { elements.soldBackdrop.hidden = true; unlockPageScroll(); }

function openForm(item = null) {
  elements.form.reset(); elements.error.textContent = ''; state.imageData = item?.image || ''; state.imageFile = null; state.imageReadPromise = null; state.imagePath = item?.imagePath || ''; state.removedImagePath = '';
  state.editingItemId = item?.id || '';
  elements.id.value = item?.id || ''; elements.name.value = item?.name || ''; elements.price.value = item?.price ?? ''; elements.description.value = item?.description || '';
  elements.sold.checked = Boolean(item?.sold); elements.soldPrice.value = item?.soldPrice ?? ''; updateSoldFields();
  elements.formEyebrow.textContent = item ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  elements.formTitle.textContent = item ? 'Gegenstand bearbeiten' : 'Gegenstand hinzufügen';
  elements.deleteItem.hidden = !item;
  elements.formAi.hidden = !item;
  setPreview(state.imageData); elements.backdrop.hidden = false; lockPageScroll();
  requestAnimationFrame(() => elements.name.focus());
}

function closeForm() { elements.backdrop.hidden = true; state.editingItemId = ''; if (elements.aiBackdrop.hidden) unlockPageScroll(); }

function updateSoldFields() {
  elements.soldPriceField.hidden = !elements.sold.checked;
  elements.soldPrice.required = elements.sold.checked;
}

function setPreview(data) {
  elements.preview.replaceChildren();
  if (!data) elements.preview.append(document.createTextNode('＋'));
  else { const image = document.createElement('img'); image.src = data; image.alt = 'Vorschau'; elements.preview.append(image); }
  elements.removeImage.hidden = !Boolean(data || state.imagePath);
}

function setAuthMessage(message, success = false) {
  elements.authError.textContent = message;
  elements.authError.classList.toggle('is-success', success);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const login = mode === 'login';
  elements.authEyebrow.textContent = login ? 'Deine Daten überall' : 'Neues Konto';
  elements.authTitle.textContent = login ? 'Anmelden' : 'Konto erstellen';
  elements.authIntro.textContent = login ? 'Melde dich an, damit deine Verkaufsgegenstände auf PC und iPhone synchron bleiben.' : 'Erstelle ein kostenloses Konto für deine private Verkaufsübersicht.';
  elements.authSubmit.textContent = login ? 'Anmelden' : 'Registrieren';
  elements.authSwitch.textContent = login ? 'Noch kein Konto? Jetzt registrieren' : 'Schon registriert? Jetzt anmelden';
  elements.authPassword.autocomplete = login ? 'current-password' : 'new-password';
  setAuthMessage('');
}

function openAuth() {
  setAuthMode('login'); elements.authForm.reset(); elements.authBackdrop.hidden = false; lockPageScroll();
  requestAnimationFrame(() => elements.authEmail.focus());
}

function lockPageScroll() {
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}

function unlockPageScroll() {
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
}

function closeAuth() { elements.authBackdrop.hidden = true; unlockPageScroll(); }

const AI_TASKS = {
  'write-description': 'Schreibe 3 bis 5 kurze, produktspezifische Stichpunkte auf Deutsch. Verwende nur gesicherte Angaben aus Produktname, Beschreibung und eindeutig sichtbaren Bildmerkmalen. Erfinde keine Details und vermeide allgemeine Werbesätze.',
  'improve-description': 'Verbessere die vorhandene Beschreibung zu 3 bis 5 kurzen, präzisen Stichpunkten. Bewahre gesicherte Produktdetails, entferne allgemeine Aussagen und erfinde nichts.',
  'price-recommendation': 'Gib eine realistische Preisempfehlung in Euro für dieses Produkt und liefere einen eindeutig übernehmbaren Preis. Begründe die Einschätzung kurz, nenne bei Unsicherheit eine Preisspanne und weise darauf hin, dass es sich um eine Schätzung handelt.'
};

function openAi(item) {
  state.aiReturnToForm = !elements.backdrop.hidden && state.editingItemId === item.id;
  state.aiProduct = item;
  state.aiItemId = item.id; state.aiResult = ''; state.aiTask = ''; state.aiRecommendedPrice = null;
  elements.aiTitle.textContent = `KI-Assistent: ${item.name}`;
  elements.aiContext.textContent = `Aktueller Preis: ${money.format(Number(item.price || 0))} · Beschreibung: ${item.description || 'keine Beschreibung hinterlegt'}`;
  elements.aiQuestion.value = ''; elements.aiResult.textContent = ''; elements.aiResultWrap.hidden = true; elements.aiApply.hidden = true; elements.aiError.textContent = '';
  elements.aiBackdrop.hidden = false; lockPageScroll();
}

function closeAi() { elements.aiBackdrop.hidden = true; if (elements.backdrop.hidden) unlockPageScroll(); }

function setAiBusy(busy) {
  elements.aiAsk.disabled = busy;
  document.querySelectorAll('.ai-action').forEach((button) => { button.disabled = busy; });
  elements.aiAsk.textContent = busy ? 'KI denkt …' : 'Frage an die KI senden';
}

async function requestAi(task, question = '') {
  if (!state.session) throw new Error('Bitte melde dich zuerst an, damit die KI sicher verwendet werden kann.');
  const item = state.aiProduct || state.items.find((entry) => entry.id === state.aiItemId);
  if (!item) throw new Error('Der ausgewählte Gegenstand ist nicht mehr verfügbar.');
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
    body: JSON.stringify({ task, question, product: { name: item.name, price: item.price, description: item.description || '', imageAvailable: Boolean(item.imagePath), imageUrl: item.image || '' } })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Die KI-Anfrage konnte nicht verarbeitet werden.');
  return { text: result.text || '', recommendedPrice: typeof result.recommendedPrice === 'number' ? result.recommendedPrice : null };
}

async function runAiTask(task) {
  elements.aiError.textContent = ''; setAiBusy(true);
  try {
    const result = await requestAi(task);
    state.aiTask = task; state.aiResult = result.text; state.aiRecommendedPrice = result.recommendedPrice;
    elements.aiResult.textContent = task === 'price-recommendation' && result.recommendedPrice != null
      ? `Empfohlener Preis: ${money.format(result.recommendedPrice)}\n\n${result.text}`
      : result.text;
    elements.aiApply.textContent = task === 'price-recommendation' ? 'Preis übernehmen' : 'Als Beschreibung übernehmen';
    elements.aiApply.hidden = task === 'price-recommendation' ? result.recommendedPrice == null : false;
    elements.aiResultWrap.hidden = false;
  }
  catch (error) { elements.aiError.textContent = error.message; }
  finally { setAiBusy(false); }
}

async function askAiQuestion() {
  const question = elements.aiQuestion.value.trim();
  if (!question) { elements.aiError.textContent = 'Bitte gib zuerst eine Frage ein.'; return; }
  elements.aiError.textContent = ''; setAiBusy(true);
  try {
    const result = await requestAi('custom', question);
    state.aiTask = 'custom'; state.aiResult = result.text; state.aiRecommendedPrice = null;
    elements.aiResult.textContent = result.text; elements.aiApply.hidden = true; elements.aiResultWrap.hidden = false;
  }
  catch (error) { elements.aiError.textContent = error.message; }
  finally { setAiBusy(false); }
}

async function applyAiResult() {
  if (!state.aiItemId || (!state.aiResult && state.aiRecommendedPrice == null)) return;
  const item = state.items.find((entry) => entry.id === state.aiItemId);
  if (!item) return;
  const appliesPrice = state.aiTask === 'price-recommendation' && state.aiRecommendedPrice != null;
  const updated = appliesPrice ? { ...item, price: state.aiRecommendedPrice } : { ...item, description: state.aiResult };
  if (state.aiReturnToForm) {
    if (appliesPrice) elements.price.value = String(state.aiRecommendedPrice);
    else elements.description.value = state.aiResult;
    closeAi();
    return;
  }
  try {
    if (state.session) { state.imagePath = item.imagePath || ''; state.imageFile = null; state.removedImagePath = ''; await saveRemoteItem(updated); await loadRemoteItems(); }
    else { state.items = state.items.map((entry) => entry.id === updated.id ? updated : entry); saveLocalItems(); render(); }
    closeAi();
  } catch (error) { elements.aiError.textContent = error.message || 'Die Änderung konnte nicht übernommen werden.'; }
}

function newId() { return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function imageExtension(file) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
}

async function signedImageUrl(path) {
  if (!path || !supabaseClient) return '';
  const cached = signedImageCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const { data } = await supabaseClient.storage.from(IMAGE_BUCKET).createSignedUrl(path, 86_400);
  const url = data?.signedUrl || '';
  if (url) signedImageCache.set(path, { url, expiresAt: Date.now() + 86_400_000 });
  return url;
}

function sameRemoteItems(previousItems, nextItems) {
  if (previousItems.length !== nextItems.length) return false;
  return previousItems.every((item, index) => {
    const next = nextItems[index];
    return item.id === next.id
      && item.name === next.name
      && item.price === next.price
      && item.description === next.description
      && item.imagePath === next.imagePath
      && item.sold === next.sold
      && item.soldPrice === next.soldPrice
      && item.soldAt === next.soldAt
      && item.createdAt === next.createdAt;
  });
}

async function loadRemoteItems({ silent = false } = {}) {
  if (!supabaseClient || !state.session) return;
  if (!silent) setSyncStatus('Synchronisiere …');
  const { data, error } = await supabaseClient.from('selling_items').select('*').order('created_at', { ascending: false });
  if (error) { setSyncStatus('Synchronisierung fehlgeschlagen', 'error'); throw error; }
  const nextItems = await Promise.all((data || []).map(async (row) => ({
    id: row.id, name: row.name, price: Number(row.price_cents || 0) / 100, description: row.description || '', imagePath: row.image_path || '', image: await signedImageUrl(row.image_path), sold: Boolean(row.sold), soldPrice: row.sold_price_cents == null ? null : Number(row.sold_price_cents) / 100, soldAt: row.sold_at || null, createdAt: row.created_at
  })));
  if (!sameRemoteItems(state.items, nextItems)) {
    state.items = nextItems;
    render();
  }
  setSyncStatus('Synchronisiert', 'online');
}

function scheduleRemoteRefresh() {
  if (state.syncTimer) window.clearInterval(state.syncTimer);
  state.syncTimer = state.session ? window.setInterval(() => loadRemoteItems({ silent: true }).catch(() => {}), 20000) : null;
}

async function handleSession(session) {
  state.session = session;
  if (session) {
    elements.authButton.textContent = 'Abmelden';
    setSyncStatus('Synchronisiere …');
    closeAuth();
    try { await loadRemoteItems(); } catch { /* status is shown by loadRemoteItems */ }
    scheduleRemoteRefresh();
  } else {
    elements.authButton.textContent = 'Anmelden';
    state.items = loadLocalItems(); render(); setSyncStatus('Lokaler Speicher'); scheduleRemoteRefresh();
  }
}

async function uploadImage(itemId, file) {
  const path = `${state.session.user.id}/${itemId}-${Date.now()}.${imageExtension(file)}`;
  const { error } = await supabaseClient.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

async function saveRemoteItem(item) {
  let imagePath = state.imagePath || null;
  if (state.imageFile) {
    imagePath = await uploadImage(item.id, state.imageFile);
    if (state.imagePath) await supabaseClient.storage.from(IMAGE_BUCKET).remove([state.imagePath]);
  } else if (state.removedImagePath) {
    await supabaseClient.storage.from(IMAGE_BUCKET).remove([state.removedImagePath]);
    imagePath = null;
  }
  const { error } = await supabaseClient.from('selling_items').upsert({
    id: item.id, user_id: state.session.user.id, name: item.name, price_cents: Math.round(item.price * 100), description: item.description, image_path: imagePath, sold: Boolean(item.sold), sold_price_cents: item.sold ? Math.round(Number(item.soldPrice) * 100) : null, sold_at: item.sold ? (item.soldAt || new Date().toISOString()) : null, updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function submitItem(event) {
  event.preventDefault();
  try { if (state.imageReadPromise) await state.imageReadPromise; }
  catch (error) { elements.error.textContent = error.message || 'Das Bild konnte nicht gelesen werden.'; return; }
  const name = elements.name.value.trim(); const price = Number(elements.price.value);
  if (!name || Number.isNaN(price) || price < 0) { elements.error.textContent = 'Bitte gib einen Namen und einen gültigen Preis ein.'; return; }
  const sold = elements.sold.checked; const soldPrice = sold ? Number(elements.soldPrice.value) : null;
  if (sold && (Number.isNaN(soldPrice) || soldPrice < 0)) { elements.error.textContent = 'Bitte gib den tatsächlichen Verkaufspreis ein.'; return; }
  const existing = state.items.find((item) => item.id === elements.id.value);
  const item = { id: existing?.id || newId(), name, price, description: elements.description.value.trim(), image: state.imageData, imagePath: state.imagePath, sold, soldPrice, soldAt: sold ? (existing?.soldAt || new Date().toISOString()) : null, createdAt: existing?.createdAt || new Date().toISOString() };
  elements.error.textContent = ''; state.busy = true;
  try {
    if (state.session) { await saveRemoteItem(item); await loadRemoteItems(); }
    else { state.items = existing ? state.items.map((entry) => entry.id === item.id ? item : entry) : [item, ...state.items]; saveLocalItems(); render(); }
    closeForm();
  } catch (error) { elements.error.textContent = error.message || 'Der Eintrag konnte nicht gespeichert werden.'; }
  finally { state.busy = false; }
}

async function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || !window.confirm(`„${item.name}“ wirklich löschen?`)) return;
  elements.error.textContent = ''; state.busy = true; elements.deleteItem.disabled = true;
  try {
    if (state.session) {
      const { error } = await supabaseClient.from('selling_items').delete().eq('id', id);
      if (error) throw error;
      if (item.imagePath) await supabaseClient.storage.from(IMAGE_BUCKET).remove([item.imagePath]);
      await loadRemoteItems();
    } else { state.items = state.items.filter((entry) => entry.id !== id); saveLocalItems(); render(); }
    closeForm();
  } catch (error) { elements.error.textContent = error.message || 'Der Eintrag konnte nicht gelöscht werden.'; }
  finally { state.busy = false; elements.deleteItem.disabled = false; }
}

async function submitAuth(event) {
  event.preventDefault();
  if (!supabaseClient) { setAuthMessage('Die Supabase-Bibliothek konnte nicht geladen werden.'); return; }
  const email = elements.authEmail.value.trim(); const password = elements.authPassword.value;
  elements.authSubmit.disabled = true; setAuthMessage('Bitte warten …');
  try {
    const result = state.authMode === 'login'
      ? await supabaseClient.auth.signInWithPassword({ email, password })
      : await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } });
    if (result.error) throw result.error;
    if (state.authMode === 'login') { await handleSession(result.data.session); }
    else if (result.data.session) { await handleSession(result.data.session); }
    else { setAuthMessage('Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse und melde dich danach an.', true); }
  } catch (error) { setAuthMessage(error.message || 'Anmeldung fehlgeschlagen.'); }
  finally { elements.authSubmit.disabled = false; }
}

elements.form.addEventListener('submit', submitItem);
elements.imageUploadButton.addEventListener('click', () => elements.image.click());
elements.image.addEventListener('change', () => {
  const file = elements.image.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { elements.error.textContent = 'Das Bild darf höchstens 5 MB groß sein.'; elements.image.value = ''; return; }
  state.imageFile = file;
  state.imageReadPromise = new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => { state.imageData = reader.result; setPreview(state.imageData); resolve(reader.result); });
    reader.addEventListener('error', () => reject(new Error('Das Bild konnte nicht gelesen werden.')));
    reader.readAsDataURL(file);
  });
});
elements.removeImage.addEventListener('click', () => {
  if (state.imagePath) state.removedImagePath = state.imagePath;
  state.imageData = ''; state.imageFile = null; state.imageReadPromise = null; state.imagePath = ''; elements.image.value = ''; setPreview('');
});

document.querySelector('#open-form-button').addEventListener('click', () => openForm());
document.querySelector('#empty-add-button').addEventListener('click', () => openForm());
elements.compactViewButton.addEventListener('click', toggleCompactView);
elements.soldValueButton.addEventListener('click', openSoldList);
document.querySelector('#close-sold-button').addEventListener('click', closeSoldList);
elements.soldBackdrop.addEventListener('click', (event) => { if (event.target === elements.soldBackdrop) closeSoldList(); });
elements.sold.addEventListener('change', updateSoldFields);
document.querySelector('#close-form-button').addEventListener('click', closeForm);
document.querySelector('#cancel-form-button').addEventListener('click', closeForm);
elements.formAi.addEventListener('click', () => {
  const savedItem = state.items.find((entry) => entry.id === state.editingItemId);
  if (!savedItem) return;
  openAi({
    ...savedItem,
    name: elements.name.value.trim() || savedItem.name,
    price: Number(elements.price.value) || savedItem.price,
    description: elements.description.value.trim(),
    image: state.imageData,
    imagePath: state.imagePath
  });
});
elements.deleteItem.addEventListener('click', () => {
  if (!state.busy && elements.id.value) deleteItem(elements.id.value);
});
elements.backdrop.addEventListener('click', (event) => { if (event.target === elements.backdrop) closeForm(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!elements.backdrop.hidden) closeForm(); if (!elements.authBackdrop.hidden) closeAuth(); if (!elements.aiBackdrop.hidden) closeAi(); if (!elements.soldBackdrop.hidden) closeSoldList(); } });

elements.authButton.addEventListener('click', async () => {
  if (!state.session) return openAuth();
  await supabaseClient.auth.signOut();
});
document.querySelector('#close-auth-button').addEventListener('click', closeAuth);
document.querySelector('#auth-backdrop').addEventListener('click', (event) => { if (event.target === elements.authBackdrop) closeAuth(); });
elements.authForm.addEventListener('submit', submitAuth);
elements.authSwitch.addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'signup' : 'login'));
document.querySelector('#close-ai-button').addEventListener('click', closeAi);
elements.aiBackdrop.addEventListener('click', (event) => { if (event.target === elements.aiBackdrop) closeAi(); });
document.querySelectorAll('.ai-action').forEach((button) => button.addEventListener('click', () => runAiTask(button.dataset.aiAction)));
elements.aiAsk.addEventListener('click', askAiQuestion);
elements.aiApply.addEventListener('click', applyAiResult);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.session) loadRemoteItems({ silent: true }).catch(() => {}); });

updateViewToggle();
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => window.setTimeout(() => handleSession(session), 0));
  supabaseClient.auth.getSession().then(({ data }) => handleSession(data.session)).catch(() => setSyncStatus('Anmeldung nicht verfügbar', 'error'));
} else { setSyncStatus('Supabase nicht geladen', 'error'); render(); }
