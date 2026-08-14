const CACHE_NAME = 'ce-hub-v1';
const urlsToCache = [
  '/ce-hub',
  '/assets/ce_hub/frontend/assets/index.css',
  '/assets/ce_hub/frontend/assets/index.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
