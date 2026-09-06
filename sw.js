const CACHE_VERSION = "vote-v5";

const PRECACHE = [
  "index.html",
  "assets/vote-app.css",
  "assets/vote-app.js",
  "assets/share-link.js",
  "assets/poster.js",
  "assets/vendor/qrcode.js",
  "assets/fonts/Anton-Regular.woff2",
  "assets/fonts/Archivo-400.woff2",
  "assets/fonts/Archivo-600.woff2",
  "assets/fonts/Archivo-700.woff2",
  "assets/fonts/Archivo-800.woff2",
  "assets/fonts/DSEG7Classic-BoldItalic.woff2",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "manifest.webmanifest",
  "data/dex/indice.json",
  "data/dex/BR.json",
];

const OWN_ASSETS = [
  "index.html",
  "assets/vote-app.css",
  "assets/vote-app.js",
  "assets/share-link.js",
  "assets/poster.js",
  "assets/vendor/qrcode.js",
  "assets/fonts/Anton-Regular.woff2",
  "assets/fonts/Archivo-400.woff2",
  "assets/fonts/Archivo-600.woff2",
  "assets/fonts/Archivo-700.woff2",
  "assets/fonts/Archivo-800.woff2",
  "assets/fonts/DSEG7Classic-BoldItalic.woff2",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "manifest.webmanifest",
];

function toScopePath(path) {
  return new URL(path, self.registration.scope).pathname;
}

function isCacheable(response) {
  return Boolean(response) && response.status === 200 && response.type === "basic";
}

async function putInCache(request, response) {
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response);
  } catch (quotaError) {
    console.error(`could not cache ${request.url}: ${quotaError.message}`);
  }
}

async function networkFirst(request, event) {
  const cache = await caches.open(CACHE_VERSION);
  let fromNetwork = null;
  try {
    fromNetwork = await fetch(request);
  } catch {
    // Network unreachable
  }
  if (fromNetwork !== null && fromNetwork.ok) {
    if (isCacheable(fromNetwork)) event.waitUntil(putInCache(request, fromNetwork.clone()));
    return fromNetwork;
  }
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;
  const shell = await cache.match(toScopePath("index.html"));
  if (shell !== undefined) return shell;
  if (fromNetwork !== null) return fromNetwork;
  return new Response("Sem conexão e sem cópia salva do aplicativo.", {
    status: 503,
    statusText: "Servico indisponivel",
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const fromNetwork = fetch(request)
    .then((response) => {
      if (isCacheable(response)) event.waitUntil(putInCache(request, response.clone()));
      return response;
    })
    .catch(() => null);

  if (cached !== undefined) {
    event.waitUntil(fromNetwork);
    return cached;
  }

  const response = await fromNetwork;
  if (response !== null) return response;
  return new Response("Sem conexão e sem cópia salva deste arquivo.", {
    status: 503,
    statusText: "Servico indisponivel",
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function cacheFirst(request, event) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) event.waitUntil(putInCache(request, response.clone()));
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE.map((path) => toScopePath(path))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const p = url.pathname;
    if (p === toScopePath("index.html") || p === toScopePath("") || p === toScopePath("/")) {
      event.respondWith(networkFirst(request, event));
    }
    return;
  }

  if (url.pathname.startsWith(toScopePath("fotos/")) || url.pathname.startsWith(toScopePath("fotos-tse/"))) {
    event.respondWith(cacheFirst(request, event));
    return;
  }

  if (url.pathname.startsWith(toScopePath("data/dex/"))) {
    event.respondWith(staleWhileRevalidate(request, event));
    return;
  }

  if (OWN_ASSETS.some((path) => url.pathname === toScopePath(path))) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
