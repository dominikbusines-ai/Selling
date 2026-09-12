// Updates take effect on the next navigation, without interrupting open forms.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.warn('App-Start ohne Offline-Hinweis:', error));
  });
}
