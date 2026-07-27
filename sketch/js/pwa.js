// Progressive Web App registration. The workbench remains fully functional
// when service workers are unavailable (for example, over plain non-local HTTP).

// Loaded after main.js has initialized the base registry. This module adds the
// redesigned detector catalogue, detector-specific displays, and palette copy.
import './detector-instruments.js';

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
