const CACHE = "aktier-v1";
const SHELL = [
  "/",
  "/index.html",
  "/stocks.html",
  "/style.css",
  "/stocks-style.css",
  "/script.js",
  "/stocks.js",
  "/icon.svg",
  "/manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // API-anrop: nätverk först, fallback till cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Statiska filer: cache först, fallback till nätverk
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
