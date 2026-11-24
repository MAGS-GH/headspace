/* BUILD_VERSION and PRECACHE are injected by the production build. */
const prefix = "aandehul:" + self.registration.scope + ":";
const cacheName = prefix + BUILD_VERSION;
const shell = new URL("./index.html", self.registration.scope).href;
const downloads = new URL("./downloads/", self.registration.scope).href;
const assets = new Set(PRECACHE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...assets].map(url => new Request(url, { cache: "reload" })));
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  url.search = "";
  if (!url.href.startsWith(self.registration.scope) || url.href.startsWith(downloads)) return;
  const isAppNavigation = request.mode === "navigate" && !/\.[a-z0-9]+$/i.test(url.pathname);
  const cacheKey = isAppNavigation ? shell : url.href;
  if (!assets.has(cacheKey)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(cacheKey) ?? fetch(request);
  })());
});
