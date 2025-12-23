// sw.js
const CACHE = "plans-glass-v12";

// ✅ include tot ce folosește app-ul (altfel rămâi cu views vechi în cache)
const ASSETS = [
  ".", "index.html", "styles.css", "manifest.webmanifest",
  "sw.js",              // ✅ adaugă asta

  "db.js",
  "app.js",

  "views/dashboard.js",
  "views/yearHome.js",
  "views/goals.js",
  "views/goalDetail.js",
  "views/habits.js",
  "views/calendar.js",
  "views/notifications.js",
  "views/budget.js",
  "views/analytics.js",
  "views/settings.js",
  "views/more.js",
  "views/account.js",
  "views/payment.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // șterge cache-urile vechi
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Helper: network-first pentru HTML (ca să primești mereu versiunea nouă)
async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw new Error("Offline and no cache");
  }
}

// Helper: cache-first pentru assets (rapid)
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  const cache = await caches.open(CACHE);
  cache.put(req, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // nu cache-ui requesturi non-GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // doar same-origin
  if (url.origin !== self.location.origin) return;

  // ✅ HTML: network-first
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(networkFirst(req));
    return;
  }

  // ✅ restul: cache-first
  e.respondWith(cacheFirst(req));
});
