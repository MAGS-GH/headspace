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

// Media elements can request only a slice of an MP3, even for its first playback.
async function audioRange(response, rangeHeader) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!range || (!range[1] && !range[2])) return response;
  const audio = await response.blob();
  const start = range[1] ? Number(range[1]) : Math.max(0, audio.size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.size - 1) : audio.size - 1;
  if (start > end || start >= audio.size) {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + audio.size } });
  }
  return new Response(audio.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Range": "bytes " + start + "-" + end + "/" + audio.size,
      "Content-Length": String(end - start + 1)
    }
  });
}

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
    const cached = await cache.match(cacheKey);
    if (!cached) return fetch(request);
    const range = request.headers.get("Range");
    if (range && url.pathname.endsWith(".mp3")) return audioRange(cached, range);
    return cached;
  })());
});
