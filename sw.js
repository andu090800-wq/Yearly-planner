// sw.js (FINAL - robust, no stale views)
const CACHE = "plans-glass-v20";

// ✅ include tot ce folosește app-ul (altfel rămâi cu views vechi în cache)
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",

  // core
  "db.js",
  "app.js",

  // views
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
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // șterge cache-urile vechi
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// ----- Strategies -----
async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

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

  const accept = req.headers.get("accept") || "";

  // ✅ HTML navigations: network-first (primești mereu ultima versiune)
  if (req.mode === "navigate" || accept.includes("text/html")) {
    e.respondWith(networkFirst(req));
    return;
  }

  // ✅ Static assets: cache-first (rapid, offline-friendly)
  const isStatic =
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2");

  if (isStatic) {
    e.respondWith(cacheFirst(req));
    return;
  }

  // ✅ Anything else (json, etc): network-first (evită “înghețarea”)
  e.respondWith(networkFirst(req));
});
