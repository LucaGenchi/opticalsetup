const CACHE_NAME = 'opticalsetup-pwa-v1';

// Keep this explicit so a successful install guarantees that the complete
// build-free workbench and its bundled examples are available offline.
const PRECACHE_PATHS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./js/canvas.js",
  "./js/elements.js",
  "./js/examples-data.js",
  "./js/export.js",
  "./js/inspector.js",
  "./js/main.js",
  "./js/polarization.js",
  "./js/polygon.js",
  "./js/pulses.js",
  "./js/pwa.js",
  "./js/qr.js",
  "./js/raytrace.js",
  "./js/share.js",
  "./js/state.js",
  "./js/util.js",
  "./js/viewport.js",
  "../Examples/Optics%20Bench/Mach%E2%80%93Zehnder%20interferometer.json",
  "../Examples/Optics%20Bench/Michelson%20interferometer.json"
];

const APP_ENTRY = new URL('./', self.location.href).href;
const PRECACHE_URLS = PRECACHE_PATHS.map(path => new URL(path, self.location.href).href);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('opticalsetup-pwa-') && key !== CACHE_NAME)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await caches.match(APP_ENTRY)) || Response.error();
    }
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first keeps installed copies current after a deployment even when
  // the service-worker source itself did not change. The precache remains the
  // fallback for every workbench request while offline.
  event.respondWith(networkFirst(request));
});
