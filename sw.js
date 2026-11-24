/* Service worker : l'appli s'ouvre même hors ligne. Jamais de cache pour Supabase. */
const CACHE = "seance-v21";
const CACHE_PHOTOS = "seance-photos-v1"; // gardé d'une version à l'autre ; changer CACHE_PHOTOS (v2…) quand une photo change
const FICHIERS = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== CACHE_PHOTOS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // toujours le réseau, jamais en cache
  if (url.origin !== location.origin) return;       // polices etc. : comportement normal du navigateur

  // Page : réseau d'abord, cache en secours
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
    e.respondWith(
      fetch(req, { cache: "no-store" }).then(r => { // toujours la dernière version, sans cache navigateur
        if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put("index.html", copie)); }
        return r;
      }).catch(() => caches.match("index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // Photos des exercices : cache d'abord, et mises en cache au premier affichage
  if (url.pathname.includes("/img/")) {
    e.respondWith(caches.open(CACHE_PHOTOS).then(c => c.match(req).then(r => r || fetch(req).then(rep => {
      // seulement une vraie image (pas la page d'un portail Wi-Fi), et le service worker attend la fin de l'écriture
      if (rep.ok && (rep.headers.get("content-type") || "").startsWith("image/")) e.waitUntil(c.put(req, rep.clone()));
      return rep;
    }))));
    return;
  }

  // Fichiers statiques : cache d'abord
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
