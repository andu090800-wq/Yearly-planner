// sw.js (FINAL - iOS-friendly updates, no stale app shell)
const CACHE = "plans-glass-v37";

const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",

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
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(ASSETS);
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

async function networkFirst(req, { fallbackToIndex = false } = {}) {
  try {
    // IMPORTANT for iOS PWAs: bypass HTTP cache for navigations
    const fresh = await fetch(req, { cache: "no-store" });
    const cache = await caches.open(CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;

    if (fallbackToIndex) {
      const idx = await caches.match("index.html");
      if (idx) return idx;
    }

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
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";

  // HTML navigations (App Shell): network-first + fallback to index.html
  if (req.mode === "navigate" || accept.includes("text/html")) {
    e.respondWith(networkFirst(req, { fallbackToIndex: true }));
    return;
  }

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

  e.respondWith(networkFirst(req));
});
