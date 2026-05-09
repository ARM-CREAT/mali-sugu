// Service Worker MALI SUGU — version 2 avec stratégie network-first pour les fichiers critiques
const CACHE = 'malisugu-v2';
const STATIC_ASSETS = ['./logo.svg', './manifest.json'];
// Fichiers à toujours fetch en priorité (sinon cache si offline)
const CRITICAL = ['/index.html', '/firebase-config.js', '/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Stratégie network-first pour les fichiers critiques (toujours essayer la version en ligne)
  const isCritical = CRITICAL.some(c => url.pathname.endsWith(c)) ||
                     url.pathname.endsWith('.js') ||
                     url.pathname.endsWith('.html');

  if (isCritical) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        return resp;
      }).catch(() => caches.match(e.request) || caches.match('./index.html'))
    );
  } else {
    // Cache-first pour les assets statiques (logo, etc.)
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        return resp;
      }))
    );
  }
});

// Forcer la mise à jour quand une nouvelle version est disponible
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
