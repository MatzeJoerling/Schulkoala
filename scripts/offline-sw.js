/* Build-Vorlage: App-Shell und versioniertes Ela-Sprachpaket. */
const ROOT = new URL('./', self.location.href);
const PREFIX = 'koala-inline-' + ROOT.pathname + '-';
const CACHE = PREFIX + '{{VERSION}}';
const FILES = {{FILES}};
const AUDIO_BASE = {{AUDIO_BASE}};
const AUDIO_CACHE = 'koala-ela-' + CACHE.slice(PREFIX.length) + '-' + ROOT.pathname;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Erst alle Antworten prüfen. Fehlerseiten dürfen keine funktionierende App ersetzen.
    const responses = await Promise.all(FILES.map(async file => {
      // Cloudflare leitet /index.html auf / um. Direkt die kanonische Startadresse laden.
      const response = await fetch(new URL(file === 'index.html' ? './' : file, ROOT), { cache: 'reload' });
      const type = response.headers.get('Content-Type') || '';
      const expected = file.endsWith('.html') ? /^text\/html\b/ : file.endsWith('.png') ? /^image\/png\b/ : /^(application\/manifest\+json|application\/json|application\/octet-stream)\b/;
      if (!response.ok || response.redirected || !expected.test(type)) throw new Error('Offline-Datei fehlt: ' + file);
      return response;
    }));
    await Promise.all(FILES.map((file, i) => cache.put(new URL(file, ROOT), responses[i])));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
async function audioResponse(request) {
  if (request.cache === 'reload') return fetch(request);
  const cached = await (await caches.open(AUDIO_CACHE)).match(request.url);
  if (!cached) return fetch(request);
  const range = request.headers.get('Range');
  if (!range) return cached;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return cached;
  const bytes = await cached.arrayBuffer(), size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes'
  } });
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  const path = url.pathname.slice(ROOT.pathname.length);
  if (path.startsWith(AUDIO_BASE) && path.endsWith('.mp3')) {
    event.respondWith(audioResponse(request).catch(() => new Response('Audio offline nicht verfügbar', { status: 503 })));
    return;
  }
  // Nur bekannte App-Dateien: keine HTML-Antwort für fehlende Audio-/JS-Dateien.
  const file = path === '' || path === 'index.html' ? 'index.html' : path;
  if (!FILES.includes(file)) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(new URL(file, ROOT));
    if (cached) return cached;
    try { return await fetch(request); }
    catch { return new Response('Offline-Datei fehlt', { status: 503 }); }
  })());
});
