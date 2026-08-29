const VERSION = '1.2.0';
const CACHE_NAME = `klapsentouren-cache-${VERSION}`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './logo.png',
  './avatars/Daniel.webp',
  './avatars/Daniela.webp',
  './avatars/Peter.webp',
  './avatars/Simone.webp',
  './avatars/Tanja.webp',
  './avatars/Thorsten.webp',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell & assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Some assets could not be pre-cached:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude Firebase Firestore network and googleapis requests from cache
  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('identitytoolkit') || 
      url.hostname.includes('securetoken')) {
    return;
  }

  // Cache-first strategy for static assets, network-fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

// Notification Click Handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
