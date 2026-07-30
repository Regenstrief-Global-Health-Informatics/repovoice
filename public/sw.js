/* RepoVoice SW v5 — never trap stale CSS/JS (Safari unstyled refresh fix) */
const CACHE = "repovoice-shell-v5";

const PRECACHE = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/repovoice-base.css",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

function isAssetRequest(url) {
  const p = url.pathname;
  return (
    p.startsWith("/assets/") ||
    p.startsWith("/@") || // vite dev
    p.startsWith("/src/") ||
    p.endsWith(".css") ||
    p.endsWith(".js") ||
    p.endsWith(".mjs") ||
    p.endsWith(".ts") ||
    p.endsWith(".tsx") ||
    p.includes("styles.css") ||
    p.includes("tanstack-start")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // CSS / JS / modules: NETWORK ONLY — never serve a cached HTML fallback
  // (that's what made Safari look unstyled after refresh/republish)
  if (isAssetRequest(url)) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).then((res) => {
        const ct = res.headers.get("content-type") || "";
        // If we got HTML for a CSS/JS request, treat as failure
        if (
          !res.ok ||
          ct.includes("text/html")
        ) {
          return res;
        }
        return res;
      }),
    );
    return;
  }

  // Static base CSS: network first, cache as backup
  if (url.pathname === "/repovoice-base.css") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || Response.error())),
    );
    return;
  }

  // Navigations: always network; do not cache HTML shells
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() =>
        caches.match("/repovoice-base.css").then(() =>
          new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title><link rel=stylesheet href=/repovoice-base.css><body style='font-family:system-ui;background:#0a0a0b;color:#f4f4f5;padding:2rem'><h1>Offline</h1><p>Reconnect to load RepoVoice.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          ),
        ),
      ),
    );
    return;
  }

  // Icons / manifest only
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".png")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
