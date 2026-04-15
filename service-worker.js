// service-worker.js

// A version name that you can update when you change the cache contents.
const CACHE_NAME = 'app-cache-v4';

// Numbered GeoJSON segments available in data/*.geojson.
const MAX_NUMBERED_GEOJSON = 350;

// List all local files to cache for offline mode.
const OFFLINE_ASSETS = [
  'index.html',
  'account.html',
  'manifest.json',
  'css/styles.css',
  'js/script.js',
  'js/firebase.js',
  'js/account.js',

  // Data files (GeoJSON/CSV/KML/GPX bundle)
  'data/at.geojson',
  'data/at.kml',
  'data/at_full_gpx.zip',
  'data/Approach Trail Coordinates.gpx',
  'data/mile_markers.csv',
  'data/resources.csv',
  'data/resupply.csv',
  'data/places.csv',
  'data/trail_points.csv',

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

function getNumberedGeojsonUrls() {
  return Array.from({ length: MAX_NUMBERED_GEOJSON }, (_, i) => `data/${i + 1}.geojson`);
}

async function cacheOptionalAssets(cache, urls) {
  await Promise.all(
    urls.map(async url => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch (err) {
        console.warn(`[Service Worker] Failed to fetch optional asset ${url}:`, err);
      }
    })
  );
}

// Installation: Open cache and add all core assets, then attempt numbered trail segments.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(OFFLINE_ASSETS);
      await cacheOptionalAssets(cache, getNumberedGeojsonUrls());
    })
  );

  // Activate this worker immediately, without waiting for old versions to unload
  self.skipWaiting();
});

// Activation: Clean up old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      )
    )
  );

  // Take control of uncontrolled clients (pages) immediately
  self.clients.claim();
});

function isSameOrigin(requestUrl) {
  return new URL(requestUrl).origin === self.location.origin;
}

function isCacheableDataRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  return isSameOrigin(request.url) && url.pathname.startsWith('/data/');
}

// Fetch: Serve cached assets when possible. Network responses for local data are cached for offline.
self.addEventListener('fetch', event => {
  const request = event.request;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(async cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      const networkResponse = await fetch(request);

      if (networkResponse && networkResponse.ok && (isCacheableDataRequest(request) || isSameOrigin(request.url))) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    }).catch(async () => {
      if (request.mode === 'navigate') {
        const fallbackPage = await caches.match('index.html');
        if (fallbackPage) {
          return fallbackPage;
        }
      }

      return new Response('Offline and resource not cached.', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
