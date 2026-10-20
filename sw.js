/*
 * Service Worker – macht die App offline nutzbar.
 *   App-Dateien und Decks:  zuerst Netz (immer aktuell), offline/langsam → Cache
 *   KaTeX und Icons:        zuerst Cache (ändern sich nie)
 * Nach Änderungen an DIESER Datei die Versionsnummer erhöhen.
 */
const CACHE = 'active-recall-v2';
const NET_TIMEOUT = 3500; // ms, danach Cache verwenden

const KATEX_FONTS = [
  'AMS-Regular', 'Caligraphic-Bold', 'Caligraphic-Regular', 'Fraktur-Bold', 'Fraktur-Regular',
  'Main-Bold', 'Main-BoldItalic', 'Main-Italic', 'Main-Regular', 'Math-BoldItalic', 'Math-Italic',
  'SansSerif-Bold', 'SansSerif-Italic', 'SansSerif-Regular', 'Script-Regular',
  'Size1-Regular', 'Size2-Regular', 'Size3-Regular', 'Size4-Regular', 'Typewriter-Regular',
].map((f) => 'vendor/katex/fonts/KaTeX_' + f + '.woff2');

const SHELL = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/fsrs.js', 'js/db.js', 'js/render.js', 'js/stats.js', 'js/ink.js', 'js/learn.js', 'js/app.js',
  'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'decks/index.json',
  ...KATEX_FONTS,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // alle Decks aus dem Index gleich mit speichern
    try {
      const idx = await (await fetch('decks/index.json', { cache: 'reload' })).json();
      await cache.addAll((idx.decks || []).map((d) => new Request('decks/' + d.datei, { cache: 'reload' })));
    } catch (e) { /* Decks kommen dann beim ersten Laden in den Cache */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vendor/') || url.pathname.includes('/icons/')) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  // Navigationsanfragen dürfen nicht mit eigenen Optionen neu gebaut werden
  const net = (req.mode === 'navigate' ? fetch(req) : fetch(req.url, { cache: 'no-cache' }))
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT));
  try {
    return await Promise.race([net, timeout]);
  } catch (e) {
    const hit = (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : null);
    if (hit) return hit;
    return net; // kein Cache vorhanden → doch auf das Netz warten (oder Fehler)
  }
}
