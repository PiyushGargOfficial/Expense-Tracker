// Minimal offline support: cache static assets, and fall back to the last seen copy of a page.
const CACHE = "expenses-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API or auth responses

  // Immutable build assets: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; })),
    );
    return;
  }

  // Pages: network first, fall back to the last copy when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
  );
});
