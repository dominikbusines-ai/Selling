const SOURCE = 'https://selling-tau.vercel.app';
const TARGET = 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html';
function validDraft(draft) {
  return draft && typeof draft.name === 'string' && draft.name.trim() && draft.name.length <= 120 &&
    typeof draft.description === 'string' && draft.description.length <= 15000 &&
    Number.isFinite(draft.price) && draft.price >= 0 &&
    (draft.image === null || (typeof draft.image === 'string' && draft.image.length <= 7_000_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.image)));
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    const url = new URL(sender.url || 'https://invalid.invalid');
    if (message.type === 'prepare' && url.origin === SOURCE && sender.frameId === 0) {
      if (!validDraft(message.draft)) throw new Error('Ungültige oder zu große Artikeldaten.');
      // Store before navigation so the destination can never race ahead of its draft.
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      const key = `draft:${tab.id}`;
      try {
        await chrome.storage.session.set({ [key]: { draft: message.draft, expires: Date.now() + 30 * 60 * 1000 } });
        await chrome.tabs.update(tab.id, { url: TARGET });
      } catch (error) { await chrome.storage.session.remove(key); throw error; }
      return { ok: true };
    }
    if (message.type === 'read' && url.origin === 'https://www.kleinanzeigen.de' && url.pathname.startsWith('/p-anzeige-aufgeben') && sender.frameId === 0) {
      const key = `draft:${sender.tab.id}`;
      const entry = (await chrome.storage.session.get(key))[key];
      if (!entry || entry.expires < Date.now()) { await chrome.storage.session.remove(key); return { ok: false }; }
      return { ok: true, draft: entry.draft };
    }
    if (message.type === 'discard' && url.origin === 'https://www.kleinanzeigen.de' && sender.frameId === 0) {
      await chrome.storage.session.remove(`draft:${sender.tab.id}`);
      return { ok: true };
    }
    throw new Error('Übergabe von dieser Seite nicht erlaubt.');
  })().then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener((id) => chrome.storage.session.remove(`draft:${id}`));
