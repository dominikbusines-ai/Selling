// Separate browser cache only; existing inventory records are never modified.
let listingCategoryOwner;
let listingCategoryCache = {};
let listingCategoryBusy = false;
let listingCategoryFailed = false;
function listingCategoryKey(item) { return JSON.stringify([item.id, item.name, item.description || '']); }
function categoryStorageKey() { return `selling-listing-categories-v1:${listingCategoryOwner}`; }
function refreshCategoryOwner() {
  const owner = state.session?.user.id || 'local';
  if (owner === listingCategoryOwner) return;
  listingCategoryOwner = owner;
  listingCategoryFailed = false;
  try { listingCategoryCache = JSON.parse(localStorage.getItem(categoryStorageKey())) || {}; } catch { listingCategoryCache = {}; }
  if (typeof listingCategoryCache !== 'object' || Array.isArray(listingCategoryCache)) listingCategoryCache = {};
}
function updateCategoryLabels() {
  document.querySelectorAll('.listing-category').forEach((label) => {
    const item = state.items.find((entry) => entry.id === label.dataset.itemId);
    if (!item) return;
    const entry = listingCategoryCache[listingCategoryKey(item)];
    label.textContent = entry ? (entry.category ? `KI-Kategorie: ${entry.category}` : 'KI-Kategorie unklar – bitte manuell wählen') : !state.session ? 'Für KI-Kategorie bitte anmelden' : listingCategoryFailed ? 'Kategorie nicht verfügbar – erneut versuchen' : 'KI-Kategorie wird vorbereitet …';
    label.title = label.textContent;
  });
}
async function scheduleListingCategories(retry = false) {
  refreshCategoryOwner();
  if (retry) listingCategoryFailed = false;
  updateCategoryLabels();
  if (listingCategoryBusy || listingCategoryFailed || !state.session || state.section !== 'selling') return;
  const owner = listingCategoryOwner;
  const token = state.session.access_token;
  listingCategoryBusy = true;
  try {
    const catalogResponse = await fetch('/kleinanzeigen-categories.json');
    if (!catalogResponse.ok) throw new Error();
    const catalog = await catalogResponse.json();
    if (owner !== listingCategoryOwner) return;
    const missing = visibleItems().filter((item) => !item.sold && listingCategoryCache[listingCategoryKey(item)]?.version !== catalog.version);
    for (let offset = 0; offset < missing.length; offset += 8) {
      if (owner !== listingCategoryOwner || state.section !== 'selling') return;
      const batch = missing.slice(offset, offset + 8);
      const response = await fetch('/api/ai', { method: 'POST', signal: AbortSignal.timeout(25000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ task: 'listing-category', products: batch.map((item) => ({ name: String(item.name).slice(0, 120), description: String(item.description || '').slice(0, 700) })) }) });
      const data = await response.json();
      if (owner !== listingCategoryOwner) return;
      if (!response.ok || data.version !== catalog.version || !Array.isArray(data.categories) || data.categories.length !== batch.length || data.categories.some((category) => category !== null && !catalog.categories.includes(category))) throw new Error();
      batch.forEach((item, index) => { listingCategoryCache[listingCategoryKey(item)] = { category: data.categories[index], version: data.version }; });
      const currentKeys = new Set(state.items.map(listingCategoryKey));
      Object.keys(listingCategoryCache).forEach((key) => { if (!currentKeys.has(key)) delete listingCategoryCache[key]; });
      try { localStorage.setItem(categoryStorageKey(), JSON.stringify(listingCategoryCache)); } catch { /* Optional browser cache. */ }
      updateCategoryLabels();
    }
  } catch { if (owner === listingCategoryOwner) listingCategoryFailed = true; }
  finally {
    listingCategoryBusy = false;
    updateCategoryLabels();
    if (owner !== listingCategoryOwner) scheduleListingCategories();
  }
}
