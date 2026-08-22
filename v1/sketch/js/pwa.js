// Progressive Web App registration. The workbench remains fully functional
// when service workers are unavailable (for example, over plain non-local HTTP).

export async function registerPWA() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    return await navigator.serviceWorker.register('./service-worker.js', {
      scope: './',
    });
  } catch (error) {
    console.warn('OpticalSetup offline support could not be enabled.', error);
    return null;
  }
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerPWA();
  }, { once: true });
}
