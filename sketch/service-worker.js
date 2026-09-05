const CACHE_NAME = 'opticalsetup-pwa-v51';

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
  "./js/acousto-optic.js",
  "./js/asphere.js",
  "./js/aotf.js",
  "./js/electro-optic.js",
  "./js/camera-profile.js",
  "./js/canvas.js",
  "./js/clipboard.js",
  "./js/lamps.js",
  "./js/probe.js",
  "./js/community-data.js",
  "./js/detector-instruments.js",
  "./js/detector-measurements.js",
  "./js/elements.js",
  "./js/etalon.js",
  "./js/examples-data.js",
  "./js/export.js",
  "./js/gif.js",
  "./js/glass.js",
  "./js/inspector.js",
  "./js/immersion.js",
  "./js/lensgroup.js",
  "./js/main.js",
  "./js/markdown.js",
  "./js/objective.js",
  "./js/polarization.js",
  "./js/polygon.js",
  "./js/proposal.js",
  "./js/pulses.js",
  "./js/pwa.js",
  "./js/qr.js",
  "./js/raytrace.js",
  "./js/share.js",
  "./js/spectrum.js",
  "./js/state.js",
  "./js/theme.js",
  "./js/timescale.js",
  "./js/two-photon-handoff.js",
  "./js/util.js",
  "./js/vipa.js",
  "./js/viewport.js",
  "./js/wiki-types.js",
  "../Examples/OPTICAL%20SETUP%20%E2%80%94%20pulsed%20component%20panorama.json",
  "../Examples/Lens%20Physics/Singlet%20vs%20achromat%20%E2%80%94%20axial%20colour.json",
  "../Examples/Lens%20Physics/Spherical%20aberration%20%E2%80%94%20ideal%20lens%20vs%20spherical%20singlet.json",
  "../Examples/Lens%20Physics/Spherical%20aberration%20%E2%80%94%20sphere%20vs%20asphere%20vs%20ideal%20lens.json",
  "../Examples/Optics%20Bench/Mach%E2%80%93Zehnder%20interferometer.json",
  "../Examples/Optics%20Bench/Michelson%20interferometer.json",
  "../Examples/Microscopy%20Implementations/Coherent%20Raman%20microscope%20%E2%80%94%20SRS%20and%20CARS.json",
  "../Examples/Microscopy%20Implementations/Multiphoton%20microscope%20%E2%80%94%20SHG%20and%20two%20photon%20fluorescence.json",
  "../Examples/Ultrashort%20Pulses/Ultrashort%20pulse%20chirping.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Array%20optics%20models.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Buckmann%202014.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Fischer%202011.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Geng%202019.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Gittard%202011.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Gu%202025%20129500%20foci.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Gu%202025%202500%20foci.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Hahn%202020.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Jiao%202023.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Kiefer%202024.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Nanoscribe%20Gt.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Ouyang%202023.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Pearre%202018.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Saha%202019.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Somers%202021.json",
  "../Examples/2PP%20Paper%20Collection/2PP%20Zhang%202024.json"
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
