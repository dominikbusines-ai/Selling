// Only text is indexed. Cache entries are scoped to the signed-in user and exact source text.
const inventoryIndex = new Map();
const inventoryRequests = new Map();
let inventorySearchRun = 0;
let inventorySearchTimer;
let inventoryCacheOwner;

function indexKey(item) {
  return JSON.stringify([item.id, item.name || '', item.description || '']);
}

function loadInventoryIndex() {
  const owner = state.session?.user.id || 'local';
  if (owner === inventoryCacheOwner) return;
  inventoryCacheOwner = owner;
  inventoryIndex.clear();
  try {
    const rows = JSON.parse(localStorage.getItem(`selling-text-index-v1:${owner}`));
    if (Array.isArray(rows)) rows.forEach(([key, tags]) => {
      if (typeof key === 'string' && Array.isArray(tags) && tags.length <= 8 && tags.every((tag) => typeof tag === 'string' && tag.length <= 80)) inventoryIndex.set(key, tags);
    });
  } catch { /* Optional local cache. */ }
}

function itemSearchTags(item) {
  return inventoryIndex.get(indexKey(item)) || [];
}

function persistInventoryIndex() {
  const liveKeys = new Set(state.items.map(indexKey));
  for (const key of inventoryIndex.keys()) if (!liveKeys.has(key)) inventoryIndex.delete(key);
  try { localStorage.setItem(`selling-text-index-v1:${inventoryCacheOwner}`, JSON.stringify([...inventoryIndex])); } catch { /* In-memory search still works. */ }
}

function searchApi(body, token, owner) {
  const key = JSON.stringify([owner, body]);
  if (!inventoryRequests.has(key)) {
    const request = (async () => {
      const response = await fetch('/api/ai', {
        method: 'POST', signal: AbortSignal.timeout(25000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error('KI-Anfrage fehlgeschlagen');
      return data;
    })();
    inventoryRequests.set(key, request);
    request.finally(() => inventoryRequests.delete(key)).catch(() => {});
  }
  return inventoryRequests.get(key);
}

function showSearchProgress(done, total, label) {
  const wrap = document.querySelector('#search-progress-wrap');
  const bar = document.querySelector('#search-progress');
  wrap.hidden = !normalizeSearch(state.search[state.section]);
  bar.max = Math.max(1, total);
  bar.value = done;
  const percent = Math.floor(done / Math.max(1, total) * 100);
  document.querySelector('#search-progress-label').textContent = `${percent} % · ${label}`;
  bar.setAttribute('aria-valuetext', `${done} von ${total} Prüfschritten abgeschlossen. ${label}`);
}

function scheduleInventorySearch() {
  clearTimeout(inventorySearchTimer);
  const run = ++inventorySearchRun;
  loadInventoryIndex();
  const term = normalizeSearch(state.search[state.section]);
  const items = visibleItems().slice();
  const owner = inventoryCacheOwner;
  const token = state.session?.access_token;
  const current = () => run === inventorySearchRun && owner === inventoryCacheOwner;
  const total = items.length + 2; // One unit per article, one for synonyms, one for local filtering.
  let done = items.filter((item) => inventoryIndex.has(indexKey(item))).length + (cachedSearchTerms(term) ? 1 : 0);
  searchPhase = '';
  showSearchProgress(done, total, 'Gespeicherte Einordnungen geprüft');
  if (!term) return;
  if (term.length > 120) { searchPhase = 'Suchbegriff zu lang – lokale Suche aktiv.'; return; }
  if (!token && done < total - 1) {
    searchPhase = 'Für die vollständige KI-Suche bitte anmelden.';
    showSearchProgress(done, total, searchPhase);
    return;
  }
  searchPhase = 'Suche wird vorbereitet …';
  showSearchProgress(done, total, 'Warte auf Ende der Eingabe');
  inventorySearchTimer = setTimeout(async () => {
    let failed = false;
    if (!cachedSearchTerms(term)) {
      showSearchProgress(done, total, 'KI erweitert den Suchbegriff …');
      try {
        const data = await searchApi({ task: 'search-terms', query: term }, token, owner);
        if (!Array.isArray(data.terms) || !data.terms.every((v) => typeof v === 'string')) throw new Error('Invalid terms');
        searchTermsCache.set(term, { terms: data.terms.slice(0, 12).map(normalizeSearch).filter(Boolean), expires: Date.now() + 30 * 86400000 });
        while (searchTermsCache.size > 100) searchTermsCache.delete(searchTermsCache.keys().next().value);
        try { localStorage.setItem(SEARCH_TERMS_KEY, JSON.stringify([...searchTermsCache])); } catch { /* Optional cache. */ }
        if (!current()) return;
        done++;
      } catch { failed = true; }
    }
    const missing = items.filter((item) => !inventoryIndex.has(indexKey(item)));
    for (let offset = 0; offset < missing.length; offset += 8) {
      if (!current()) return;
      const batch = missing.slice(offset, offset + 8);
      showSearchProgress(done, total, `KI ordnet Artikel ein · ${items.length - missing.length + offset} von ${items.length} bereits geprüft`);
      try {
        const data = await searchApi({ task: 'search-index', products: batch.map((item) => ({ name: String(item.name || '').slice(0, 120), description: String(item.description || '').slice(0, 700) })) }, token, owner);
        if (owner !== inventoryCacheOwner) return;
        if (!Array.isArray(data.tags) || data.tags.length !== batch.length || data.tags.some((tags) => !Array.isArray(tags) || tags.length > 8 || tags.some((tag) => typeof tag !== 'string' || tag.length > 80))) throw new Error('Invalid index');
        batch.forEach((item, index) => inventoryIndex.set(indexKey(item), data.tags[index].map(normalizeSearch)));
        persistInventoryIndex();
        if (!current()) return;
        done += batch.length;
        showSearchProgress(done, total, `${done - (cachedSearchTerms(term) ? 1 : 0)} von ${items.length} Artikeln eingeordnet`);
      } catch { failed = true; break; }
    }
    if (!current()) return;
    searchPhase = failed ? 'KI-Suche unvollständig – vorhandene Einordnungen und Texttreffer werden angezeigt.' : 'KI-Suche abgeschlossen.';
    render();
    done++; // Local filtering has actually finished.
    showSearchProgress(done, total, failed ? searchPhase : `${items.length} Artikel geprüft · Suche abgeschlossen`);
  }, 900);
}
