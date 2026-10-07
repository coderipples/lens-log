// Network-first cache so the app opens offline but always gets fresh files when online.
// When adding a file, list it in ASSETS and bump VERSION.

const VERSION = "v3";
const CACHE = `lenslog-${VERSION}`;
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "js/app.js",
  "js/dates.js",
  "js/calc.js",
  "js/actions.js",
  "js/store.js",
  "js/ui/dom.js",
  "js/ui/toast.js",
  "js/ui/sheet.js",
  "js/ui/now.js",
  "js/ui/now-sheet.js",
  "js/ui/activity-sheet.js",
  "js/ui/day-note.js",
  "js/ui/stats.js",
  "js/ui/history.js",
  "js/ui/settings.js",
  "icons/icon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((hit) => hit ?? (request.mode === "navigate" ? caches.match("index.html") : null))
        .then((hit) => hit ?? Response.error())),
  );
});
