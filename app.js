const STORAGE_KEY = 'verkaufsliste-items-v1';
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const state = { items: loadItems(), imageData: '' };
const elements = {
  grid: document.querySelector('#item-grid'), empty: document.querySelector('#empty-state'), total: document.querySelector('#total-value'), count: document.querySelector('#item-count'),
  backdrop: document.querySelector('#modal-backdrop'), form: document.querySelector('#item-form'), formTitle: document.querySelector('#form-title'), formEyebrow: document.querySelector('#form-eyebrow'), error: document.querySelector('#form-error'),
  id: document.querySelector('#item-id'), name: document.querySelector('#item-name'), price: document.querySelector('#item-price'), description: document.querySelector('#item-description'), image: document.querySelector('#item-image'), preview: document.querySelector('#upload-preview')
};

function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveItems() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }

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
    card.querySelector('.item-date').textContent = `angelegt am ${dateFormat.format(new Date(item.createdAt))}`;
    if (item.image) { image.src = item.image; image.alt = `Bild von ${item.name}`; card.querySelector('.no-image').hidden = true; } else { image.hidden = true; }
    card.querySelector('.edit-button').addEventListener('click', () => openForm(item));
    card.querySelector('.delete-button').addEventListener('click', () => deleteItem(item.id));
    card.querySelector('.more-button').addEventListener('click', () => openForm(item));
    elements.grid.append(card);
  });
}

function openForm(item = null) {
  elements.form.reset(); elements.error.textContent = ''; state.imageData = item?.image || '';
  elements.id.value = item?.id || ''; elements.name.value = item?.name || ''; elements.price.value = item?.price ?? ''; elements.description.value = item?.description || '';
  elements.formEyebrow.textContent = item ? 'Eintrag bearbeiten' : 'Neuer Eintrag';
  elements.formTitle.textContent = item ? 'Gegenstand bearbeiten' : 'Gegenstand hinzufügen';
  setPreview(state.imageData); elements.backdrop.hidden = false; document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => elements.name.focus());
}

function closeForm() { elements.backdrop.hidden = true; document.body.style.overflow = ''; }

function setPreview(data) {
  elements.preview.innerHTML = data ? `<img src="${data}" alt="Vorschau" />` : '＋';
}

function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || !window.confirm(`„${item.name}“ wirklich löschen?`)) return;
  state.items = state.items.filter((entry) => entry.id !== id); saveItems(); render();
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.name.value.trim(); const price = Number(elements.price.value);
  if (!name || Number.isNaN(price) || price < 0) { elements.error.textContent = 'Bitte gib einen Namen und einen gültigen Preis ein.'; return; }
  const existing = state.items.find((item) => item.id === elements.id.value);
  const item = { id: existing?.id || crypto.randomUUID(), name, price, description: elements.description.value.trim(), image: state.imageData, createdAt: existing?.createdAt || new Date().toISOString() };
  state.items = existing ? state.items.map((entry) => entry.id === item.id ? item : entry) : [item, ...state.items];
  saveItems(); render(); closeForm();
});

elements.image.addEventListener('change', () => {
  const file = elements.image.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { elements.error.textContent = 'Das Bild darf höchstens 5 MB groß sein.'; elements.image.value = ''; return; }
  const reader = new FileReader(); reader.addEventListener('load', () => { state.imageData = reader.result; setPreview(state.imageData); }); reader.readAsDataURL(file);
});

document.querySelector('#open-form-button').addEventListener('click', () => openForm());
document.querySelector('#empty-add-button').addEventListener('click', () => openForm());
document.querySelector('#close-form-button').addEventListener('click', closeForm);
document.querySelector('#cancel-form-button').addEventListener('click', closeForm);
elements.backdrop.addEventListener('click', (event) => { if (event.target === elements.backdrop) closeForm(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !elements.backdrop.hidden) closeForm(); });

document.querySelector('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `verkaufsliste-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
});

document.querySelector('#import-input').addEventListener('change', (event) => {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported) || imported.some((item) => !item.name || typeof item.price !== 'number')) throw new Error();
      state.items = imported; saveItems(); render();
    } catch { window.alert('Die Datei konnte nicht importiert werden.'); }
    event.target.value = '';
  }); reader.readAsText(file);
});

render();
