document.documentElement.dataset.sellingBridge = '1';
let transferring = false;
window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== 'https://selling-tau.vercel.app' || event.data?.type !== 'SELLING_PREPARE_DRAFT') return;
  const { requestId, draft } = event.data;
  if (typeof requestId !== 'string' || transferring) return;
  transferring = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'prepare', draft });
    window.postMessage({ type: 'SELLING_DRAFT_RESULT', requestId, ...result }, location.origin);
  } catch { window.postMessage({ type: 'SELLING_DRAFT_RESULT', requestId, ok: false, error: 'Erweiterung bitte neu laden und die Website erneut öffnen.' }, location.origin); }
  finally { transferring = false; }
});
