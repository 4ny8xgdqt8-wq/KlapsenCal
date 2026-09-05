const VERSION = "3.0.2";
const CACHE_NAME = `klapsentouren-cache-${VERSION}`;

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./README.md",
  "./css/style.css",
  "./js/app.js",
  "./logo.png",
  "./favicon.ico",
  "./favicon-32x32.png",
  "./favicon-16x16.png",
  "./apple-touch-icon.png",
  "./apple-touch-icon-180x180.png",
  "./apple-touch-icon-152x152.png",
  "./apple-touch-icon-120x120.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./avatars/Daniel.webp",
  "./avatars/Daniela.webp",
  "./avatars/Peter.webp",
  "./avatars/Simone.webp",
  "./avatars/Tanja.webp",
  "./avatars/Thorsten.webp",
  "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Pre-caching core assets...");
        return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
          console.warn("[SW] Some assets could not be pre-cached:", err);
        });
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Exclude Firebase Firestore network and googleapis requests from cache
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("securetoken")
  ) {
    return;
  }

  // Network-First strategy for app assets (HTML, JS, CSS, PNG, WEBP, JSON) so updates are always immediate
  if (
    event.request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // Cache-First with Network Fallback for external CDN scripts / fonts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      });
    }),
  );
});

// Notification Click Handling
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "./index.html";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("index.html") && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
