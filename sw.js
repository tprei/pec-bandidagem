const VERSAO = "dex-v7";

const CONCHA = [
  "dex.html",
  "assets/dex.css",
  "assets/dex.js",
  "assets/fontes/DSEG7Classic-BoldItalic.woff2",
  "assets/icone.svg",
  "assets/icone-192.png",
  "assets/icone-512.png",
  "manifest.webmanifest",
  "data/dex/indice.json",
  "data/dex/BR.json",
];

const PROPRIOS = [
  "dex.html",
  "assets/dex.css",
  "assets/dex.js",
  "assets/fontes/DSEG7Classic-BoldItalic.woff2",
  "assets/icone.svg",
  "assets/icone-192.png",
  "assets/icone-512.png",
  "manifest.webmanifest",
];
function absoluta(caminho) {
  return new URL(caminho, self.registration.scope).pathname;
}

function podeGuardar(resposta) {
  return Boolean(resposta) && resposta.status === 200 && resposta.type === "basic";
}

async function guardar(pedido, resposta) {
  try {
    const cache = await caches.open(VERSAO);
    await cache.put(pedido, resposta);
  } catch (semEspaco) {
    console.error(`não foi possível guardar ${pedido.url} no cache: ${semEspaco.message}`);
  }
}

async function primeiroDaRede(pedido, evento) {
  const cache = await caches.open(VERSAO);
  let daRede = null;
  try {
    daRede = await fetch(pedido);
  } catch (semRede) {
    daRede = null;
  }
  if (daRede !== null && daRede.ok) {
    if (podeGuardar(daRede)) evento.waitUntil(guardar(pedido, daRede.clone()));
    return daRede;
  }
  const salva = await cache.match(absoluta("dex.html"));
  if (salva !== undefined) return salva;
  if (daRede !== null) return daRede;
  return new Response("Sem conexão e sem cópia salva do aplicativo.", {
    status: 503,
    statusText: "Servico indisponivel",
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function revalidando(pedido, evento) {
  const cache = await caches.open(VERSAO);
  const salva = await cache.match(pedido);
  const daRede = fetch(pedido)
    .then((resposta) => {
      if (podeGuardar(resposta)) evento.waitUntil(guardar(pedido, resposta.clone()));
      return resposta;
    })
    .catch(() => null);

  if (salva !== undefined) {
    evento.waitUntil(daRede);
    return salva;
  }

  const resposta = await daRede;
  if (resposta !== null) return resposta;
  return new Response("Sem conexão e sem cópia salva deste arquivo.", {
    status: 503,
    statusText: "Servico indisponivel",
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function primeiroDoCache(pedido, evento) {
  const cache = await caches.open(VERSAO);
  const salva = await cache.match(pedido);
  if (salva !== undefined) return salva;
  const resposta = await fetch(pedido);
  if (podeGuardar(resposta)) evento.waitUntil(guardar(pedido, resposta.clone()));
  return resposta;
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.addAll(CONCHA.map((caminho) => absoluta(caminho))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((nome) => nome !== VERSAO).map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === "navigate") {
    if (url.pathname !== absoluta("dex.html")) return;
    evento.respondWith(primeiroDaRede(pedido, evento));
    return;
  }

  if (url.pathname.startsWith(absoluta("fotos/")) || url.pathname.startsWith(absoluta("fotos-tse/"))) {
    evento.respondWith(primeiroDoCache(pedido, evento));
    return;
  }

  if (url.pathname.startsWith(absoluta("data/dex/"))) {
    evento.respondWith(revalidando(pedido, evento));
    return;
  }

  if (PROPRIOS.some((caminho) => url.pathname === absoluta(caminho))) {
    evento.respondWith(revalidando(pedido, evento));
  }
});
