const SOURCE = 'https://selling-tau.vercel.app';
const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
const TARGET = 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html';
async function pruneDrafts() {
  const entries = await extensionApi.storage.session.get(null);
  const tabs = new Set((await extensionApi.tabs.query({})).map((tab) => tab.id));
  const stale = Object.entries(entries).filter(([key, entry]) => key.startsWith('draft:') &&
    (!entry || entry.expires <= Date.now() || !tabs.has(Number(key.slice(6))))).map(([key]) => key);
  if (stale.length) await extensionApi.storage.session.remove(stale);
}
function validDraft(draft) {
  return draft && typeof draft.name === 'string' && draft.name.trim() && draft.name.length <= 120 &&
    typeof draft.description === 'string' && draft.description.length <= 15000 &&
    Number.isFinite(draft.price) && draft.price >= 0 &&
    (draft.categoryPath === undefined || (Array.isArray(draft.categoryPath) && [0, 2].includes(draft.categoryPath.length) && draft.categoryPath.every((part) => typeof part === 'string' && part.trim() && part.length <= 120))) &&
    (draft.image === null || (typeof draft.image === 'string' && draft.image.length <= 7_000_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.image)));
}
extensionApi.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    const url = new URL(sender.url || 'https://invalid.invalid');
    if (message.type === 'prepare' && url.origin === SOURCE && sender.frameId === 0) {
      if (!validDraft(message.draft)) throw new Error('Ungültige oder zu große Artikeldaten.');
      await pruneDrafts();
      // Store before navigation so the destination can never race ahead of its draft.
      const tab = await extensionApi.tabs.create({ url: 'about:blank', active: true });
      const key = `draft:${tab.id}`;
      try {
        await extensionApi.storage.session.set({ [key]: { draft: message.draft, expires: Date.now() + 30 * 60 * 1000 } });
        await extensionApi.tabs.update(tab.id, { url: TARGET });
      } catch (error) {
        await extensionApi.storage.session.remove(key).catch(() => {});
        // Remove only the empty tab created by this failed handoff.
        await extensionApi.tabs.remove(tab.id).catch(() => {});
        if (/quota/i.test(`${error.name} ${error.message}`)) {
          throw new Error('Der Entwurfsspeicher ist voll. Bitte abgeschlossene Entwurfs-Tabs schließen oder dort „Übergabe beenden“ wählen. Bestehende Entwürfe bleiben unverändert.');
        }
        throw error;
      }
      return { ok: true };
    }
    if (message.type === 'read' && url.origin === 'https://www.kleinanzeigen.de' && url.pathname.startsWith('/p-anzeige-aufgeben') && sender.frameId === 0) {
      const key = `draft:${sender.tab.id}`;
      const entry = (await extensionApi.storage.session.get(key))[key];
      if (!entry || entry.expires < Date.now()) { await extensionApi.storage.session.remove(key); return { ok: false }; }
      return { ok: true, draft: entry.draft };
    }
    if (message.type === 'discard' && url.origin === 'https://www.kleinanzeigen.de' && sender.frameId === 0) {
      await extensionApi.storage.session.remove(`draft:${sender.tab.id}`);
      return { ok: true };
    }
    throw new Error('Übergabe von dieser Seite nicht erlaubt.');
  })().then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});
extensionApi.tabs.onRemoved.addListener((id) => extensionApi.storage.session.remove(`draft:${id}`));
