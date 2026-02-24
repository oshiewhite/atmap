// service-worker.js

// A version name that you can update when you change the cache contents.
const CACHE_NAME = 'app-cache-v2';

// List all local files to cache for offline mode.
const OFFLINE_ASSETS = [
  'index.html',
  'css/styles.css',
  'js/script.js',

  // Data files (GeoJSON/CSV)
  'data/at.geojson',
  'data/mile_markers.csv',
  'data/resources.csv',
  'data/resupply.csv',
  'data/places.csv',

  // Icons and image assets used by markers and the UI.
  'icons/resupply_marker.png',
  'icons/tent.png',
  'icons/crossing.png',
  'icons/water.png',
  'icons/post office.png',
  'icons/grocery.png',
  'icons/hostel.png',
  'icons/pharmacy.png',
  'icons/hospital.png',
  'icons/outfitter.png',
  'icons/library.png',
  'icons/shuttle.png',
  'icons/bus.png',
  'icons/taxi.png',

  // Local library files (used in offline mode)
  'libs/leaflet/leaflet.css',
  'libs/leaflet/leaflet.js',
  'libs/awesomplete-gh-pages/awesomplete.css',
  'libs/awesomplete-gh-pages/awesomplete.min.js',
  'libs/leaflet/leaflet.markercluster/dist/MarkerCluster.css',
  'libs/leaflet/leaflet.markercluster/dist/MarkerCluster.Default.css',
  'libs/leaflet/leaflet.markercluster/dist/leaflet.markercluster.js',
  'libs/leaflet-gpx/gpx.js',
  'libs/togeojson.umd.js',
  'libs/oms.min.js',
  'libs/leaflet/images/marker-icon.png',
  'libs/leaflet/images/marker-icon-2x.png',
  'libs/leaflet/images/marker-shadow.png'
];

// Installation: Open the cache and add all the assets, plus geojson 1–100 if they exist.
self.addEventListener('install', event => {
  console.log('[Service Worker] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log('[Service Worker] Caching core offline assets');
      // 1) Cache the core assets
      await cache.addAll(OFFLINE_ASSETS);

      // 2) Attempt to cache data/1.geojson … data/100.geojson, but skip any that 404
      const geojsonUrls = Array.from({ length: 100 }, (_, i) => `data/${i + 1}.geojson`);
      await Promise.all(
        geojsonUrls.map(url =>
          fetch(url)
            .then(response => {
              if (response.ok) {
                console.log(`[Service Worker] Caching ${url}`);
                return cache.put(url, response);
              }
              // If not OK (404), just skip
            })
            .catch(err => {
              // Network or other error—skip this file
              console.warn(`[Service Worker] Failed to fetch ${url}:`, err);
            })
        )
      );
    })
  );
  // Activate this worker immediately, without waiting for old versions to unload
  self.skipWaiting();
});

// Activation: Clean up old caches.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      )
    )
  );
  // Take control of uncontrolled clients (pages) immediately
  self.clients.claim();
});

// Fetch: Serve cached assets if available, else fetch from network.
self.addEventListener('fetch', event => {
  console.log('[Service Worker] Fetching:', event.request.url);
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        // Optionally, you could cache new network responses here.
        return networkResponse;
      });
    }).catch(() => {
      // Optionally, return a fallback resource for failed requests, e.g. offline page
      // return caches.match('/offline.html');
    })
  );
});
