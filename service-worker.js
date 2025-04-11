// service-worker.js

// A version name that you can update when you change the cache contents.
const CACHE_NAME = 'app-cache-v1';

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
  'libs/leaflet/leaflet.markercluster/dist/leaflet.markercluster.js'
];

// Installation: Open the cache and add all the assets.
self.addEventListener('install', event => {
  console.log('[Service Worker] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching offline assets');
        return cache.addAll(OFFLINE_ASSETS);
      })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activation: Clean up old caches.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Serve cached assets if available, else fetch from network.
self.addEventListener('fetch', event => {
  // Log the fetch request for debugging.
  console.log('[Service Worker] Fetching:', event.request.url);
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached version if we have it.
        if (cachedResponse) {
          return cachedResponse;
        }
        // Otherwise fetch from network.
        return fetch(event.request)
          .then(networkResponse => {
            // Optionally: Cache the new network response here if you want to update your cache.
            return networkResponse;
          });
      })
      .catch(() => {
        // Optionally, respond with a fallback (e.g. offline page or default asset) when both cache and network fail.
        // return caches.match('/offline.html');
      })
  );
});
