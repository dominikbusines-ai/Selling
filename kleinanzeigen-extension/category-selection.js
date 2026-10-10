// Restrict clicks to the category picker. Never click Weiter or submit an ad.
async function selectSellingCategory(path, isActive = () => true) {
  const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');
  const shown = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
  function picker() {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,legend')].filter((node) => shown(node) && norm(node.textContent) === 'kategorie auswählen');
    if (headings.length !== 1) return null;
    let root = headings[0].parentElement;
    while (root && root !== document.body && root !== document.documentElement) {
      if (/unterkategorie/i.test(root.textContent) && root.querySelector('a,button,[role="option"],[role="treeitem"],li')) return root;
      root = root.parentElement;
    }
    return null;
  }
  if (!picker()) return { picker: false, text: '' };
  if (!Array.isArray(path) || path.length !== 2) return { picker: true, text: 'Keine Kategorieempfehlung übergeben. Bitte Kategorie selbst auswählen.' };
  function candidates(name, minLeft = -Infinity) {
    const root = picker();
    if (!root) return [];
    const matches = [...root.querySelectorAll('a,button,[role="option"],[role="treeitem"],[role="button"],li')].filter((node) => {
      if (!shown(node) || node.getBoundingClientRect().left < minLeft) return false;
      // Only exact names (or full title/accessible label), never fuzzy/truncated text.
      const exact = [node.textContent, node.getAttribute('title'), node.getAttribute('aria-label')].some((text) => norm(text) === norm(name));
      if (!exact) return false;
      if (node.tagName === 'A') {
        const href = node.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
          const target = new URL(href, location.href);
          if (target.origin !== location.origin || !target.pathname.startsWith('/p-anzeige-aufgeben')) return false;
        }
        if (href?.startsWith('javascript:')) return false;
      }
      return true;
    });
    return matches.filter((node) => !matches.some((other) => other !== node && node.contains(other)));
  }
  function waitForChild(name, minLeft) {
    return new Promise((resolve) => {
      const check = () => {
        const matches = candidates(name, minLeft);
        if (matches.length === 1) finish(matches[0]);
        else if (matches.length > 1) finish(null);
      };
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => finish(null), 6000);
      const finish = (value) => { clearTimeout(timer); observer.disconnect(); resolve(value); };
      observer.observe(picker(), { childList: true, subtree: true, attributes: true });
      check();
    });
  }
  const parents = candidates(path[0]);
  if (parents.length !== 1) return { picker: true, text: `Hauptkategorie „${path[0]}“ nicht eindeutig erkannt. Bitte selbst auswählen.` };
  const left = parents[0].getBoundingClientRect().left;
  if (!isActive()) return { picker: true, text: 'Übergabe beendet.' };
  parents[0].click();
  if (!picker()) return { picker: true, text: 'Kategorieansicht hat sich geändert. Bitte Auswahl kontrollieren.' };
  const child = await waitForChild(path[1], left + 40);
  if (!child) return { picker: true, text: `Unterkategorie „${path[1]}“ nicht eindeutig erkannt. Bitte selbst auswählen.` };
  if (!isActive()) return { picker: true, text: 'Übergabe beendet.' };
  child.click();
  return { picker: true, text: `„${path.join(' > ')}“ angeklickt. Bitte Markierung prüfen, eine eventuell weitere Unterkategorie selbst wählen und dann „Weiter“ klicken.` };
}
