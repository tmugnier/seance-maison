/* Service worker : l'appli s'ouvre même hors ligne. Jamais de cache pour Supabase. */
const CACHE = "seance-v23";
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

  // Polices Google : gardées en cache (l'app s'affiche tout de suite avec la bonne police, même sans réseau)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(CACHE_PHOTOS).then(c => c.match(req).then(r => r || fetch(req).then(rep => {
      if (rep.ok || rep.type === "opaque") e.waitUntil(c.put(req, rep.clone()));
      return rep;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;

  // Page : réseau d'abord pour avoir la dernière version, mais si le réseau traîne plus de 2,5 s, on ouvre la version en cache
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html")) {
    const reseau = fetch(req, { cache: "no-store" }).then(r => {
      if (r.ok) { const copie = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put("index.html", copie))); }
      return r;
    });
    const enCache = () => caches.match("index.html").then(r => r || caches.match("./"));
    const delai = new Promise(ok => setTimeout(ok, 2500)).then(enCache);
    e.respondWith(Promise.race([reseau.catch(enCache), delai.then(r => r || reseau)]).then(r => r || reseau));
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
