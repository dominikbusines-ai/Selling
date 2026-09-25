const SUPABASE_URL = 'https://kfriqckayjehbigvrnys.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qe872JZtouSldyBjzwjR6Q_NpGaTyyq';
const STORAGE_KEY = 'verkaufsliste-items-v1';
const SEARCH_KEY = 'verkaufsliste-search-v1';
const savedSearch = loadSearch();
const SEARCH_TERMS_KEY = 'verkaufsliste-search-terms-v1';
const searchTermsCache = loadSearchTerms();
let searchPhase = '';

function normalizeSearch(value) {
  return String(value || '').toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').trim();
}

function loadSearchTerms() {
  try {
    const rows = JSON.parse(localStorage.getItem(SEARCH_TERMS_KEY));
    return new Map(Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && typeof row[0] === 'string' && row[1]?.expires > Date.now() && Array.isArray(row[1]?.terms) && row[1].terms.every((term) => typeof term === 'string')).slice(-100) : []);
  } catch { return new Map(); }
}

function cachedSearchTerms(term) {
  const entry = searchTermsCache.get(term);
  return entry?.expires > Date.now() ? entry.terms : null;
}

function scheduleSearchExpansion() {
  scheduleInventorySearch();
}
const IMAGE_BUCKET = 'selling-images';
const AI_IMAGE_MAX_EDGE = 1800;
const signedImageCache = new Map();
let previewObserver;
const previewQueue = new Set();
let activePreviewLoads = 0;
let previewFrame = 0;

function pumpPreviewQueue() {
  // Re-sort on scrolling so a jump down the page does not wait for images above it.
  const viewportHeight = window.innerHeight;
  const distance = (image) => {
    const rect = image.getBoundingClientRect();
    return rect.bottom < 0 ? -rect.bottom : Math.max(0, rect.top - viewportHeight);
  };
  const queued = [...previewQueue].filter((image) => image.isConnected)
    .sort((a, b) => distance(a) - distance(b));
  for (const image of queued) {
    if (activePreviewLoads >= 4) break;
    previewQueue.delete(image);
    const src = image.dataset.previewSrc;
    if (!src) continue;
    delete image.dataset.previewSrc;
    activePreviewLoads++;
    image.fetchPriority = distance(image) === 0 ? 'high' : 'auto';
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      image.removeEventListener('load', done);
      image.removeEventListener('error', done);
      activePreviewLoads--;
      pumpPreviewQueue();
    };
    image.addEventListener('load', done);
    image.addEventListener('error', done);
    image.src = src;
    if (image.complete) done();
  }
}

function preparePreviewLoading() {
  previewObserver?.disconnect();
  previewQueue.clear();
  previewObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) previewQueue.add(target);
      else previewQueue.delete(target);
    });
    pumpPreviewQueue();
  }, { rootMargin: '2000px 0px 4000px 0px' }) : null;
}

window.addEventListener('scroll', () => {
  if (previewFrame || !previewQueue.size) return;
  previewFrame = requestAnimationFrame(() => { previewFrame = 0; pumpPreviewQueue(); });
}, { passive: true });
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
  section: location.hash ? (location.hash === '#wertgegenstaende' ? 'valuables' : 'selling') : savedSearch.section,
  search: savedSearch.queries,
  formSection: 'selling',
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
  scrollLockY: 0,
  busy: false
};

const elements = {
  search: document.querySelector('#item-search'), clearSearch: document.querySelector('#clear-search'), searchStatus: document.querySelector('#search-status'),
  grid: document.querySelector('#item-grid'), empty: document.querySelector('#empty-state'), total: document.querySelector('#total-value'), count: document.querySelector('#item-count'),
  backdrop: document.querySelector('#modal-backdrop'), form: document.querySelector('#item-form'), formTitle: document.querySelector('#form-title'), formEyebrow: document.querySelector('#form-eyebrow'), error: document.querySelector('#form-error'),
  id: document.querySelector('#item-id'), name: document.querySelector('#item-name'), price: document.querySelector('#item-price'), description: document.querySelector('#item-description'), image: document.querySelector('#item-image'), imageUploadButton: document.querySelector('#image-upload-button'), preview: document.querySelector('#upload-preview'), removeImage: document.querySelector('#remove-image-button'), deleteItem: document.querySelector('#delete-item-button'), formAi: document.querySelector('#open-ai-from-form'),
  syncStatus: document.querySelector('#sync-status'), compactViewButton: document.querySelector('#compact-view-button'), soldValue: document.querySelector('#sold-value'), soldCount: document.querySelector('#sold-count'), soldValueButton: document.querySelector('#sold-value-button'), soldBackdrop: document.querySelector('#sold-backdrop'), soldSummary: document.querySelector('#sold-summary'), soldList: document.querySelector('#sold-list'), authButton: document.querySelector('#auth-button'), authBackdrop: document.querySelector('#auth-backdrop'), authForm: document.querySelector('#auth-form'), authTitle: document.querySelector('#auth-title'), authEyebrow: document.querySelector('#auth-eyebrow'), authIntro: document.querySelector('#auth-intro'), authEmail: document.querySelector('#auth-email'), authPassword: document.querySelector('#auth-password'), authSubmit: document.querySelector('#auth-submit'), authError: document.querySelector('#auth-error'), authSwitch: document.querySelector('#auth-switch'),
  aiBackdrop: document.querySelector('#ai-backdrop'), aiTitle: document.querySelector('#ai-title'), aiContext: document.querySelector('#ai-product-context'), aiQuestion: document.querySelector('#ai-question'), aiAsk: document.querySelector('#ai-ask-button'), aiResultWrap: document.querySelector('#ai-result-wrap'), aiResult: document.querySelector('#ai-result'), aiApply: document.querySelector('#ai-apply-button'), aiError: document.querySelector('#ai-error'),
  sold: document.querySelector('#item-sold'), ready: document.querySelector('#item-ready'), soldPriceField: document.querySelector('#sold-price-field'), soldPrice: document.querySelector('#item-sold-price'), saveItem: document.querySelector('#item-form button[type="submit"]'), cancelForm: document.querySelector('#cancel-form-button'), closeForm: document.querySelector('#close-form-button'), imageBackdrop: document.querySelector('#image-backdrop'), imagePreview: document.querySelector('#image-preview'), imagePreviewTitle: document.querySelector('#image-preview-title')
};

function loadLocalItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function loadSearch() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEARCH_KEY));
    return {
      section: saved?.section === 'valuables' ? 'valuables' : 'selling',
      queries: Object.fromEntries(['selling', 'valuables'].map((section) => [section, typeof saved?.queries?.[section] === 'string' ? saved.queries[section] : '']))
    };
  } catch { return { section: 'selling', queries: { selling: '', valuables: '' } }; }
}

function saveSearch() {
  try { localStorage.setItem(SEARCH_KEY, JSON.stringify({ section: state.section, queries: state.search })); } catch { /* Search still works when browser storage is unavailable. */ }
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

function itemSection(item) { return item.category === 'valuables' ? 'valuables' : 'selling'; }

function visibleItems() { return state.items.filter((item) => itemSection(item) === state.section); }

function updateSection() {
  const valuables = state.section === 'valuables';
  document.body.classList.toggle('valuables-page', valuables);
  document.title = `${valuables ? 'Wertgegenstände' : 'Verkaufsliste'} · Meine Gegenstände`;
  document.querySelectorAll('[data-section]').forEach((link) => {
    if (link.dataset.section === state.section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('.hero-intro .eyebrow').textContent = valuables ? 'Deine Wertübersicht' : 'Deine Verkaufsübersicht';
  document.querySelector('#page-title').innerHTML = valuables ? 'Deine Schätze.<br /><em>Alles im Blick.</em>' : 'Weniger suchen.<br /><em>Mehr verkaufen.</em>';
  document.querySelector('.hero-copy').textContent = valuables ? 'Behalte deine Wertgegenstände mit Bild und Wert im Überblick – auf all deinen Geräten.' : 'Halte deine Gegenstände, Preise und Bilder an einem Ort fest – und synchronisiere sie geräteübergreifend.';
  document.querySelector('.workspace').setAttribute('aria-label', valuables ? 'Wertgegenstände' : 'Verkaufsübersicht');
  document.querySelector('.section-heading h2').textContent = valuables ? 'Deine Wertgegenstände' : 'Deine Gegenstände';
  document.querySelector('.value-card:not(button)').setAttribute('aria-label', valuables ? 'Gesamtwert der Wertgegenstände' : 'Gesamtwert der noch verfügbaren Gegenstände');
  document.querySelector('#empty-state p').textContent = valuables ? 'Lege deinen ersten Wertgegenstand an – mit Name, Wert und Bild.' : 'Lege deinen ersten Gegenstand an – mit Bild, Preis und einer kurzen Beschreibung.';
  elements.soldValueButton.hidden = valuables;
}

function render() {
  preparePreviewLoading();
  updateSection();
  const items = visibleItems();
  const query = state.search[state.section];
  const term = normalizeSearch(query);
  const expanded = cachedSearchTerms(term);
  const terms = [term, ...(expanded || [])];
  const matches = items.filter((item) => {
    const text = normalizeSearch(`${item.name || ''} ${item.description || ''} ${itemSearchTags(item).join(' ')}`);
    return terms.some((value) => text.includes(value));
  });
  if (elements.search.value !== query) elements.search.value = query;
  elements.clearSearch.hidden = !query;
  elements.searchStatus.hidden = !term;
  elements.searchStatus.textContent = !term ? '' : matches.length ? `${matches.length} von ${items.length} Artikeln gefunden` : 'Keine Artikel mit diesem Namen gefunden.';
  if (term) elements.searchStatus.textContent = `${matches.length} von ${items.length} Artikeln gefunden. ${searchPhase}`;
  elements.grid.innerHTML = '';
  elements.grid.classList.toggle('compact-view', state.compactView);
  elements.empty.hidden = items.length > 0;
  const availableItems = items.filter((item) => state.section === 'valuables' || !item.sold);
  const soldItems = items.filter((item) => itemSection(item) === 'selling' && item.sold);
  const total = availableItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const soldTotal = soldItems.reduce((sum, item) => sum + Number(item.soldPrice ?? item.price ?? 0), 0);
  elements.total.textContent = money.format(total);
  elements.count.textContent = `${availableItems.length} ${availableItems.length === 1 ? 'Gegenstand' : 'Gegenstände'}${state.section === 'valuables' ? '' : ' verfügbar'}`;
  elements.soldValue.textContent = money.format(soldTotal);
  elements.soldCount.textContent = `${soldItems.length} verkauft · Details öffnen`;

  matches.forEach((item, index) => {
    const card = document.querySelector('#item-template').content.cloneNode(true);
    const image = card.querySelector('.item-image');
    card.querySelector('.item-name').textContent = item.name;
    card.querySelector('.item-description').textContent = item.description || 'Keine Beschreibung hinterlegt.';
    const displayPrice = item.sold ? Number(item.soldPrice ?? item.price) : Number(item.price);
    card.querySelector('.item-price').textContent = item.sold ? `Verkauft: ${money.format(displayPrice)}` : money.format(displayPrice);
    card.querySelector('.compact-price').textContent = money.format(displayPrice);
    card.querySelector('.item-date').textContent = `angelegt am ${formatDate(item.createdAt)}`;
    const itemCard = card.querySelector('.item-card');
    itemCard.classList.toggle('is-sold', Boolean(item.sold));
    itemCard.classList.toggle('is-ready', Boolean(item.readyForSale && !item.sold));
    if (item.image) {
      image.hidden = false;
      image.classList.add('is-loading');
      image.decoding = 'async';
      // The observer handles the preload distance; native lazy loading would delay it again.
      image.loading = 'eager';
      image.fetchPriority = index < 3 ? 'high' : 'auto';
      image.alt = `Bild von ${item.name}`;
      const fallback = card.querySelector('.no-image');
      fallback.hidden = true;
      image.addEventListener('load', () => image.classList.remove('is-loading'), { once: true });
      image.addEventListener('error', () => {
        image.classList.remove('is-loading');
        image.hidden = true;
        fallback.hidden = false;
        fallback.textContent = 'Bild konnte nicht geladen werden';
      }, { once: true });
      if (previewObserver) image.dataset.previewSrc = item.image;
      else image.src = item.image;
      if (image.complete && image.naturalWidth > 0) image.classList.remove('is-loading');
    } else { image.hidden = true; }
    card.querySelector('.ai-button').addEventListener('click', () => openAi(item));
    itemCard.classList.toggle('is-compact', state.compactView);
    itemCard.tabIndex = 0;
    itemCard.setAttribute('role', 'button');
    itemCard.setAttribute('aria-label', `${item.name} bearbeiten`);
    itemCard.addEventListener('click', (event) => {
      if (event.target.closest('button, a')) return;
      if (!state.compactView && event.target.closest('.item-image-wrap') && item.image) openImagePreview(item);
      else openForm(item);
    });
    itemCard.addEventListener('keydown', (event) => {
      if (event.target !== itemCard || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openForm(item);
    });
    elements.grid.append(card);
    if (item.image && previewObserver) previewObserver.observe(image);
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
  const soldItems = state.items.filter((item) => itemSection(item) === 'selling' && item.sold);
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

function openImagePreview(item) {
  if (!item.image) return openForm(item);
  elements.imagePreviewTitle.textContent = item.name;
  elements.imagePreview.src = item.image;
  elements.imagePreview.alt = `Großansicht von ${item.name}`;
  elements.imageBackdrop.hidden = false;
  lockPageScroll();
}

function closeImagePreview() {
  elements.imageBackdrop.hidden = true;
  elements.imagePreview.removeAttribute('src');
  if (elements.backdrop.hidden && elements.aiBackdrop.hidden && elements.soldBackdrop.hidden) unlockPageScroll();
}

function openForm(item = null) {
  state.formSection = item ? itemSection(item) : state.section;
  const valuables = state.formSection === 'valuables';
  elements.form.classList.toggle('valuables-form', valuables);
  elements.description.closest('label').hidden = valuables;
  elements.sold.closest('.sold-toggle').hidden = valuables;
  elements.ready.closest('.ready-toggle').hidden = valuables;
  elements.price.closest('label').querySelector('span').textContent = valuables ? 'Wert in Euro' : 'Preis in Euro';
  elements.form.reset(); elements.error.textContent = ''; state.imageData = item?.image || ''; state.imageFile = null; state.imageReadPromise = null; state.imagePath = item?.imagePath || ''; state.removedImagePath = '';
  state.editingItemId = item?.id || '';
  elements.id.value = item?.id || ''; elements.name.value = item?.name || ''; elements.price.value = item?.price ?? ''; elements.description.value = item?.description || '';
  elements.sold.checked = Boolean(item?.sold); elements.ready.checked = Boolean(item?.readyForSale); elements.soldPrice.value = item?.soldPrice ?? ''; updateSoldFields();
  elements.formEyebrow.textContent = item ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  elements.formTitle.textContent = valuables ? (item ? 'Wertgegenstand bearbeiten' : 'Wertgegenstand hinzufügen') : (item ? 'Gegenstand bearbeiten' : 'Gegenstand hinzufügen');
  elements.deleteItem.hidden = !item;
  elements.formAi.hidden = !item || valuables;
  setPreview(state.imageData); elements.backdrop.hidden = false; lockPageScroll();
  if (!window.matchMedia?.('(pointer: coarse)').matches) requestAnimationFrame(() => elements.name.focus());
}

function closeForm() { elements.backdrop.hidden = true; state.editingItemId = ''; if (elements.aiBackdrop.hidden) unlockPageScroll(); }

function updateSoldFields() {
  const sold = state.formSection === 'selling' && elements.sold.checked;
  elements.soldPriceField.hidden = !sold;
  elements.soldPrice.required = sold;
}

function setPreview(data) {
  elements.preview.replaceChildren();
  if (!data) elements.preview.append(document.createTextNode('＋'));
  else { const image = document.createElement('img'); image.src = data; image.alt = 'Vorschau'; elements.preview.append(image); }
  elements.removeImage.hidden = !Boolean(data || state.imagePath);
}

function setFormBusy(busy) {
  elements.form.setAttribute('aria-busy', String(busy));
  elements.saveItem.disabled = busy;
  elements.cancelForm.disabled = busy;
  elements.closeForm.disabled = busy;
  elements.deleteItem.disabled = busy;
  elements.saveItem.textContent = busy
    ? (state.imageFile ? 'Bild wird gespeichert …' : 'Speichert …')
    : 'Eintrag speichern';
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
  if (document.documentElement.classList.contains('modal-open')) return;
  state.scrollLockY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${state.scrollLockY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.height = 'auto';
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
}

function unlockPageScroll() {
  const scrollY = state.scrollLockY;
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.body.style.height = '';
  window.scrollTo(0, scrollY);
}

function closeAuth() { elements.authBackdrop.hidden = true; unlockPageScroll(); }

const AI_TASKS = {
  'write-description': 'Schreibe 3 bis 5 kurze, produktspezifische Stichpunkte auf Deutsch. Verwende nur gesicherte Angaben aus Produktname, Beschreibung und eindeutig sichtbaren Bildmerkmalen. Erfinde keine Details und vermeide allgemeine Werbesätze.',
  'improve-description': 'Verbessere die vorhandene Beschreibung zu 3 bis 5 kurzen, präzisen Stichpunkten. Bewahre gesicherte Produktdetails, entferne allgemeine Aussagen und erfinde nichts.',
  'price-recommendation': 'Gib eine realistische Preisempfehlung in Euro für dieses Produkt und liefere einen eindeutig übernehmbaren Preis. Begründe die Einschätzung kurz, nenne bei Unsicherheit eine Preisspanne und weise darauf hin, dass es sich um eine Schätzung handelt.'
};

function openAi(item) {
  if (itemSection(item) === 'valuables') return;
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
  const imageUrl = await prepareAiImage(item);
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
    body: JSON.stringify({ task, question, product: { name: item.name, price: item.price, description: item.description || '', imageAvailable: Boolean(item.imagePath || imageUrl), imageUrl } })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Die KI-Anfrage konnte nicht verarbeitet werden.');
  return { text: result.text || '', recommendedPrice: typeof result.recommendedPrice === 'number' ? result.recommendedPrice : null };
}

function resizeImageForAi(imageUrl) {
  if (!imageUrl || typeof Image === 'undefined') return Promise.resolve('');
  return new Promise((resolve) => {
    const source = new Image();
    if (!imageUrl.startsWith('data:')) source.crossOrigin = 'anonymous';
    source.addEventListener('load', () => {
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      if (!width || !height) return resolve('');
      const scale = Math.min(1, AI_IMAGE_MAX_EDGE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      try {
        const context = canvas.getContext('2d');
        if (!context) return resolve('');
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.76));
      } catch {
        resolve('');
      }
    }, { once: true });
    source.addEventListener('error', () => resolve(''), { once: true });
    source.src = imageUrl;
  });
}

async function prepareAiImage(item) {
  const resized = await resizeImageForAi(item.image || '');
  if (resized) return resized;
  if (item.imagePath && supabaseClient) {
    const { data } = await supabaseClient.storage.from(IMAGE_BUCKET).createSignedUrl(item.imagePath, 86_400, {
      transform: { width: AI_IMAGE_MAX_EDGE, height: AI_IMAGE_MAX_EDGE, resize: 'contain', quality: 76 }
    });
    if (data?.signedUrl) return data.signedUrl;
  }
  return item.image || '';
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

async function prepareImageLinks(rows) {
  const cacheKey = `verkaufsliste-image-links:${state.session.user.id}`;
  // Reuse the exact URL so that the browser can reuse the downloaded image.
  try {
    const saved = JSON.parse(sessionStorage.getItem(cacheKey) || '[]');
    for (const [path, entry] of saved) {
      if (entry.expiresAt > Date.now() + 60_000 && !signedImageCache.has(path)) signedImageCache.set(path, entry);
    }
  } catch { /* Caching is optional when browser storage is unavailable. */ }
  const paths = [...new Set(rows.map((row) => row.image_path).filter(Boolean))];
  const missing = paths.filter((path) => !signedImageCache.has(path) || signedImageCache.get(path).expiresAt <= Date.now() + 60_000);
  for (let offset = 0; offset < missing.length; offset += 100) {
    const { data, error } = await supabaseClient.storage.from(IMAGE_BUCKET).createSignedUrls(missing.slice(offset, offset + 100), 86_400);
    if (error) throw error;
    for (const entry of data || []) {
      if (entry.signedUrl && !entry.error) signedImageCache.set(entry.path, { url: entry.signedUrl, expiresAt: Date.now() + 86_400_000 });
    }
  }
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(paths.filter((path) => signedImageCache.has(path)).map((path) => [path, signedImageCache.get(path)])));
  } catch { /* Continue normally without the optional cache. */ }
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
      && item.image === next.image
      && item.sold === next.sold
      && itemSection(item) === itemSection(next)
      && item.readyForSale === next.readyForSale
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
  await prepareImageLinks(data || []);
  const nextItems = await Promise.all((data || []).map(async (row) => ({
    category: row.category || 'selling',
    id: row.id, name: row.name, price: Number(row.price_cents || 0) / 100, description: row.description || '', imagePath: row.image_path || '', image: await signedImageUrl(row.image_path), sold: Boolean(row.sold), readyForSale: Boolean(row.ready_for_sale), soldPrice: row.sold_price_cents == null ? null : Number(row.sold_price_cents) / 100, soldAt: row.sold_at || null, createdAt: row.created_at
  })));
  if (!sameRemoteItems(state.items, nextItems)) {
    state.items = nextItems;
    scheduleSearchExpansion();
    render();
  }
  setSyncStatus('Synchronisiert', 'online');
}

function scheduleRemoteRefresh() {
  if (state.syncTimer) window.clearInterval(state.syncTimer);
  state.syncTimer = state.session ? window.setInterval(() => loadRemoteItems({ silent: true }).catch(() => {}), 20000) : null;
}

async function handleSession(session) {
  if (state.session?.user.id !== session?.user.id) {
    if (state.session) {
      try { sessionStorage.removeItem(`verkaufsliste-image-links:${state.session.user.id}`); } catch { /* optional cache */ }
    }
    signedImageCache.clear();
  }
  state.session = session;
  scheduleSearchExpansion();
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
    category: itemSection(item),
    id: item.id, user_id: state.session.user.id, name: item.name, price_cents: Math.round(item.price * 100), description: item.description, image_path: imagePath, sold: Boolean(item.sold), ready_for_sale: Boolean(item.readyForSale), sold_price_cents: item.sold ? Math.round(Number(item.soldPrice) * 100) : null, sold_at: item.sold ? (item.soldAt || new Date().toISOString()) : null, updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function submitItem(event) {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true;
  setFormBusy(true);
  try {
    // Für den Supabase-Upload wird die Originaldatei direkt verwendet. Die
    // Vorschau muss dort nicht erst als Data-URL gelesen werden – das ist auf
    // iPhones bei großen Fotos oder HEIC-Dateien unnötig langsam.
    if (!state.session && state.imageReadPromise) await state.imageReadPromise;
    const name = elements.name.value.trim(); const price = Number(elements.price.value);
    if (!name || Number.isNaN(price) || price < 0) { elements.error.textContent = 'Bitte gib einen Namen und einen gültigen Preis ein.'; return; }
    const valuables = state.formSection === 'valuables';
    const sold = !valuables && elements.sold.checked; const soldPrice = sold ? Number(elements.soldPrice.value) : null;
    if (sold && (Number.isNaN(soldPrice) || soldPrice < 0)) { elements.error.textContent = 'Bitte gib den tatsächlichen Verkaufspreis ein.'; return; }
    const existing = state.items.find((item) => item.id === elements.id.value);
    const item = { id: existing?.id || newId(), name, price, description: elements.description.value.trim(), image: state.imageData, imagePath: state.imagePath, sold, readyForSale: elements.ready.checked, soldPrice, soldAt: sold ? (existing?.soldAt || new Date().toISOString()) : null, createdAt: existing?.createdAt || new Date().toISOString() };
    item.category = existing ? itemSection(existing) : state.formSection;
    if (valuables) { item.description = ''; item.readyForSale = false; }
    elements.error.textContent = state.imageFile ? 'Bild wird hochgeladen …' : 'Eintrag wird gespeichert …';
    if (state.session) { await saveRemoteItem(item); await loadRemoteItems(); }
    else { state.items = existing ? state.items.map((entry) => entry.id === item.id ? item : entry) : [item, ...state.items]; saveLocalItems(); render(); }
    closeForm();
  } catch (error) {
    elements.error.textContent = error.message || 'Der Eintrag konnte nicht gespeichert werden.';
    elements.error.scrollIntoView({ block: 'nearest' });
  } finally {
    state.busy = false;
    setFormBusy(false);
  }
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
  state.imageReadPromise.catch(() => {});
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
document.querySelector('#close-image-button').addEventListener('click', closeImagePreview);
elements.imageBackdrop.addEventListener('click', (event) => { if (event.target === elements.imageBackdrop) closeImagePreview(); });
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
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!elements.backdrop.hidden) closeForm(); if (!elements.authBackdrop.hidden) closeAuth(); if (!elements.aiBackdrop.hidden) closeAi(); if (!elements.soldBackdrop.hidden) closeSoldList(); if (!elements.imageBackdrop.hidden) closeImagePreview(); } });

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

window.addEventListener('hashchange', () => {
  state.section = location.hash === '#wertgegenstaende' ? 'valuables' : 'selling';
  saveSearch();
  scheduleSearchExpansion();
  render();
});
elements.search.addEventListener('input', () => {
  state.search[state.section] = elements.search.value;
  saveSearch();
  scheduleSearchExpansion();
  render();
});
elements.clearSearch.addEventListener('click', () => {
  state.search[state.section] = '';
  saveSearch();
  scheduleSearchExpansion();
  render();
  elements.search.focus();
});
updateSection();
updateViewToggle();
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => window.setTimeout(() => handleSession(session), 0));
  supabaseClient.auth.getSession().then(({ data }) => handleSession(data.session)).catch(() => setSyncStatus('Anmeldung nicht verfügbar', 'error'));
} else { setSyncStatus('Supabase nicht geladen', 'error'); scheduleSearchExpansion(); render(); }
