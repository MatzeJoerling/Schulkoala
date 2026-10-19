/* Versionsnummer bei Änderungen an HTML/JS erhöhen. Alle Pfade bleiben im Pages-Unterordner. */
importScripts('./audio-pack.js');
const PREFIX = 'koala-shell-' + new URL('./', self.location.href).pathname + '-';
const V = PREFIX + 'v8';
const FILES = ['./', './index.html', './audio-pack.js', AUDIO_PACK.manifest,
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== V)
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function audioResponse(request) {
  if (request.cache === 'reload') return fetch(request); // Defekte Cache-Einträge wirklich neu laden.
  const cache = await caches.open(AUDIO_PACK.cache);
  const full = await cache.match(request.url);
  if (!full) return fetch(request); // Bei Audio niemals index.html als Ersatz liefern.
  const range = request.headers.get('Range');
  if (!range) return full;
  const bytes = await full.arrayBuffer(), size = bytes.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  // Nicht unterstützte Mehrfach-Ranges dürfen als komplette 200-Antwort beantwortet werden.
  if (!match || (!match[1] && !match[2])) return new Response(bytes, { headers: full.headers });
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg',
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes'
  } });
}
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url), scope = new URL('./', self.location.href);
  if (e.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const audioBase = new URL(AUDIO_PACK.base, scope).pathname;
  if (url.pathname.startsWith(audioBase) && url.pathname.endsWith('.mp3')) {
    e.respondWith(audioResponse(e.request).catch(() => new Response(null, { status: 503 })));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(V);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(e.request); }
    catch (error) {
      if (e.request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html')) {
        return await cache.match('./index.html');
      }
      return new Response(null, { status: 503 });
    }
  })());
});
