const SUPABASE_URL = 'https://kfriqckayjehbigvrnys.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qe872JZtouSldyBjzwjR6Q_NpGaTyyq';
const STORAGE_KEY = 'verkaufsliste-items-v1';
const IMAGE_BUCKET = 'selling-images';
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const supabaseClient = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

const state = {
  items: loadLocalItems(),
  session: null,
  imageData: '',
  imageFile: null,
  imagePath: '',
  authMode: 'login',
  syncTimer: null,
  busy: false
};
let lockedScrollY = 0;

const elements = {
  grid: document.querySelector('#item-grid'), empty: document.querySelector('#empty-state'), total: document.querySelector('#total-value'), count: document.querySelector('#item-count'),
  backdrop: document.querySelector('#modal-backdrop'), form: document.querySelector('#item-form'), formTitle: document.querySelector('#form-title'), formEyebrow: document.querySelector('#form-eyebrow'), error: document.querySelector('#form-error'),
  id: document.querySelector('#item-id'), name: document.querySelector('#item-name'), price: document.querySelector('#item-price'), description: document.querySelector('#item-description'), image: document.querySelector('#item-image'), preview: document.querySelector('#upload-preview'),
  syncStatus: document.querySelector('#sync-status'), authButton: document.querySelector('#auth-button'), authBackdrop: document.querySelector('#auth-backdrop'), authForm: document.querySelector('#auth-form'), authTitle: document.querySelector('#auth-title'), authEyebrow: document.querySelector('#auth-eyebrow'), authIntro: document.querySelector('#auth-intro'), authEmail: document.querySelector('#auth-email'), authPassword: document.querySelector('#auth-password'), authSubmit: document.querySelector('#auth-submit'), authError: document.querySelector('#auth-error'), authSwitch: document.querySelector('#auth-switch')
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
  elements.empty.hidden = state.items.length > 0;
  const total = state.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  elements.total.textContent = money.format(total);
  elements.count.textContent = `${state.items.length} ${state.items.length === 1 ? 'Gegenstand' : 'Gegenstände'}`;

  state.items.forEach((item) => {
    const card = document.querySelector('#item-template').content.cloneNode(true);
    const image = card.querySelector('.item-image');
    card.querySelector('.item-name').textContent = item.name;
    card.querySelector('.item-description').textContent = item.description || 'Keine Beschreibung hinterlegt.';
    card.querySelector('.item-price').textContent = money.format(Number(item.price));
    card.querySelector('.item-date').textContent = `angelegt am ${formatDate(item.createdAt)}`;
    if (item.image) { image.src = item.image; image.alt = `Bild von ${item.name}`; card.querySelector('.no-image').hidden = true; } else { image.hidden = true; }
    card.querySelector('.edit-button').addEventListener('click', () => openForm(item));
    card.querySelector('.delete-button').addEventListener('click', () => deleteItem(item.id));
    card.querySelector('.more-button').addEventListener('click', () => openForm(item));
    elements.grid.append(card);
  });
}

function openForm(item = null) {
  elements.form.reset(); elements.error.textContent = ''; state.imageData = item?.image || ''; state.imageFile = null; state.imagePath = item?.imagePath || '';
  elements.id.value = item?.id || ''; elements.name.value = item?.name || ''; elements.price.value = item?.price ?? ''; elements.description.value = item?.description || '';
  elements.formEyebrow.textContent = item ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  elements.formTitle.textContent = item ? 'Gegenstand bearbeiten' : 'Gegenstand hinzufügen';
  setPreview(state.imageData); elements.backdrop.hidden = false; lockPageScroll();
  requestAnimationFrame(() => elements.name.focus());
}

function closeForm() { elements.backdrop.hidden = true; unlockPageScroll(); }

function setPreview(data) {
  elements.preview.replaceChildren();
  if (!data) { elements.preview.append(document.createTextNode('＋')); return; }
  const image = document.createElement('img'); image.src = data; image.alt = 'Vorschau'; elements.preview.append(image);
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
  lockedScrollY = window.scrollY;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  document.body.style.top = `-${lockedScrollY}px`;
}

function unlockPageScroll() {
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lockedScrollY);
}

function closeAuth() { elements.authBackdrop.hidden = true; unlockPageScroll(); }

function newId() { return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function imageExtension(file) {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension || (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
}

async function signedImageUrl(path) {
  if (!path || !supabaseClient) return '';
  const { data } = await supabaseClient.storage.from(IMAGE_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl || '';
}

async function loadRemoteItems({ silent = false } = {}) {
  if (!supabaseClient || !state.session) return;
  if (!silent) setSyncStatus('Synchronisiere …');
  const { data, error } = await supabaseClient.from('selling_items').select('*').order('created_at', { ascending: false });
  if (error) { setSyncStatus('Synchronisierung fehlgeschlagen', 'error'); throw error; }
  state.items = await Promise.all((data || []).map(async (row) => ({
    id: row.id, name: row.name, price: Number(row.price_cents || 0) / 100, description: row.description || '', imagePath: row.image_path || '', image: await signedImageUrl(row.image_path), createdAt: row.created_at
  })));
  render(); setSyncStatus('Synchronisiert', 'online');
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
  }
  const { error } = await supabaseClient.from('selling_items').upsert({
    id: item.id, user_id: state.session.user.id, name: item.name, price_cents: Math.round(item.price * 100), description: item.description, image_path: imagePath, updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function submitItem(event) {
  event.preventDefault();
  const name = elements.name.value.trim(); const price = Number(elements.price.value);
  if (!name || Number.isNaN(price) || price < 0) { elements.error.textContent = 'Bitte gib einen Namen und einen gültigen Preis ein.'; return; }
  const existing = state.items.find((item) => item.id === elements.id.value);
  const item = { id: existing?.id || newId(), name, price, description: elements.description.value.trim(), image: state.imageData, imagePath: state.imagePath, createdAt: existing?.createdAt || new Date().toISOString() };
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
  try {
    if (state.session) {
      const { error } = await supabaseClient.from('selling_items').delete().eq('id', id);
      if (error) throw error;
      if (item.imagePath) await supabaseClient.storage.from(IMAGE_BUCKET).remove([item.imagePath]);
      await loadRemoteItems();
    } else { state.items = state.items.filter((entry) => entry.id !== id); saveLocalItems(); render(); }
  } catch (error) { window.alert(error.message || 'Der Eintrag konnte nicht gelöscht werden.'); }
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

async function exportItems() {
  const exportData = state.items.map(({ image, ...item }) => ({ ...item, image: image?.startsWith('data:') ? image : '' }));
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `verkaufsliste-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
}

async function importItems(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported) || imported.some((item) => !item.name || typeof item.price !== 'number')) throw new Error();
      if (state.session) {
        for (const importedItem of imported) await saveRemoteItem({ ...importedItem, id: importedItem.id || newId(), imagePath: '' });
        await loadRemoteItems();
      } else { state.items = imported; saveLocalItems(); render(); }
    } catch { window.alert('Die Datei konnte nicht importiert werden.'); }
    event.target.value = '';
  }); reader.readAsText(file);
}

elements.form.addEventListener('submit', submitItem);
elements.image.addEventListener('change', () => {
  const file = elements.image.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { elements.error.textContent = 'Das Bild darf höchstens 5 MB groß sein.'; elements.image.value = ''; return; }
  state.imageFile = file;
  const reader = new FileReader(); reader.addEventListener('load', () => { state.imageData = reader.result; setPreview(state.imageData); }); reader.readAsDataURL(file);
});

document.querySelector('#open-form-button').addEventListener('click', () => openForm());
document.querySelector('#empty-add-button').addEventListener('click', () => openForm());
document.querySelector('#close-form-button').addEventListener('click', closeForm);
document.querySelector('#cancel-form-button').addEventListener('click', closeForm);
elements.backdrop.addEventListener('click', (event) => { if (event.target === elements.backdrop) closeForm(); });
document.querySelector('#export-button').addEventListener('click', exportItems);
document.querySelector('#import-input').addEventListener('change', importItems);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!elements.backdrop.hidden) closeForm(); if (!elements.authBackdrop.hidden) closeAuth(); } });

elements.authButton.addEventListener('click', async () => {
  if (!state.session) return openAuth();
  await supabaseClient.auth.signOut();
});
document.querySelector('#close-auth-button').addEventListener('click', closeAuth);
document.querySelector('#auth-backdrop').addEventListener('click', (event) => { if (event.target === elements.authBackdrop) closeAuth(); });
elements.authForm.addEventListener('submit', submitAuth);
elements.authSwitch.addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'signup' : 'login'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.session) loadRemoteItems({ silent: true }).catch(() => {}); });

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => window.setTimeout(() => handleSession(session), 0));
  supabaseClient.auth.getSession().then(({ data }) => handleSession(data.session)).catch(() => setSyncStatus('Anmeldung nicht verfügbar', 'error'));
} else { setSyncStatus('Supabase nicht geladen', 'error'); render(); }
