const CACHE_NAME = 'getrin-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/html/login.html',
  '/html/dashboard.html',
  '/html/portal.html',
  '/html/workers.html',
  '/html/trainings.html',
  '/html/alerts.html',
  '/html/reports.html',
  '/html/profile.html',
  '/html/empresa.html',
  '/css/style.css',
  '/css/login.css',
  '/css/portal.css',
  '/css/workers.css',
  '/css/alerts.css',
  '/css/reports.css',
  '/css/profile.css',
  '/css/tutor.css',
  '/css/empresa.css',
  '/js/data.js',
  '/js/login.js',
  '/js/dashboard.js',
  '/js/portal.js',
  '/js/workers.js',
  '/js/trainings.js',
  '/js/alerts.js',
  '/js/reports.js',
  '/js/profile.js',
  '/js/tutor.js',
  '/js/empresa.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia de Fetch: Network First, falling back to cache
self.addEventListener('fetch', (event) => {
  // Ignora chamadas para a API (serão tratadas pelo IndexedDB no data.js)
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then((cachedResponse) => cachedResponse || new Response('', {
            status: 404,
            statusText: 'Not Found'
          }));
      })
  );
});
