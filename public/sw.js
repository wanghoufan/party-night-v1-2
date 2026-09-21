const CACHE_NAME = "party-night-shell-v1.2.0";
const SHELL = ["/", "/manifest.webmanifest", "/brand/party-night-logo.svg", "/brand/party-night-mark.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.method !== "GET") return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && (request.mode === "navigate" || url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname))) {
      const clone = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("/") : undefined))));
});
