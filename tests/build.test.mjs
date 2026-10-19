import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build } from '../scripts/build.mjs';

let temp, result, html, worker, config;
before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'schulkoala-build-'));
  result = await build({ outputDir: temp });
  html = await readFile(join(result.standaloneDir, 'index.html'), 'utf8');
  worker = await readFile(join(result.webDir, 'sw.js'), 'utf8');
  const code = html.match(/<script>(const AUDIO_PACK[\s\S]*?)<\/script>/)[1];
   config = vm.runInNewContext(code + '; AUDIO_PACK', { URL, self: { location: { href: 'file:///test/index.html' } } });
});
after(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

test('Einzeldatei enthält alle Audio- und Icon-Bytes; keine externen Dateien nötig', async () => {
  assert.deepEqual(await readdir(result.standaloneDir), ['index.html']);
  assert.equal(config.standalone, true);
  assert.equal(config.embedded.manifest.clips.length, 994);
  for (const clip of config.embedded.manifest.clips) {
    const url = config.embedded.clips[clip.key];
    assert.ok(url.startsWith('data:audio/mpeg;base64,'));
    const { pack } = JSON.parse(await readFile(new URL('../audio-profile.json', import.meta.url), 'utf8'));
    const original = await readFile(new URL('../' + pack + '/' + clip.file, import.meta.url));
    assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), original);
  }
  for (const [rel, name] of [['icon', 'icon-192.png'], ['apple-touch-icon', 'icon-180.png']]) {
    const tag = html.match(new RegExp(`<link rel="${rel}"[^>]*>`))[0];
    const base64 = tag.match(/href="data:image\/png;base64,([^"]+)"/)[1];
    assert.deepEqual(Buffer.from(base64, 'base64'), await readFile(new URL('../' + name, import.meta.url)));
  }
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+(?:manifest|stylesheet)|(?:src|href)="(?:\.\/)?(?:audio\/|icon-)/);
  assert.doesNotMatch(html, /ELEVENLABS_API_KEY|xi-api-key/);
  assert.equal(result.standaloneBytes, Buffer.byteLength(html));
});

test('Build ist reproduzierbar und Cloudflare lädt nur die fertigen Web-Dateien hoch', async () => {
  const files = (await readdir(result.webDir, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => join(e.parentPath, e.name));
  const previous = new Map(await Promise.all(files.map(async name => [name, await readFile(name)])));
  const again = await build({ outputDir: temp });
  assert.equal(again.version, result.version);
  assert.equal(previous.size, 1001);
  for (const [name, bytes] of previous) {
    assert.ok(bytes.length <= 25 * 1024 * 1024, name);
    assert.deepEqual(await readFile(name), bytes);
  }
  const webHtml = await readFile(join(result.webDir, 'index.html'), 'utf8');
  assert.doesNotMatch(webHtml, /data:audio|ELEVENLABS_API_KEY|xi-api-key/);
  const webConfig = vm.runInNewContext(webHtml.match(/<script>(const AUDIO_PACK[\s\S]*?)<\/script>/)[1] + '; AUDIO_PACK', { URL, self: { location: { href: 'https://example.com/Schulkoala/' } } });
  assert.equal(webConfig.cache, `koala-ela-${result.version}-/Schulkoala/`);
  assert.equal(webConfig.base, `./audio/${result.version}/`);
  for (const clip of config.embedded.manifest.clips) assert.ok(previous.has(join(result.webDir, webConfig.base, clip.file)));
  const wrangler = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.assets.directory, './dist/web');
  assert.ok(worker.includes(result.version));
});

function workerContext({ invalid = false } = {}) {
  const root = 'https://example.com/Schulkoala/';
  const stored = new Map(), handlers = {}, deleted = [], calls = [];
  let offline = false, activated = false;
  const context = vm.createContext({ URL, Response,
    self: { location: { href: root + 'sw.js?v=' + result.version }, addEventListener: (event, fn) => { handlers[event] = fn; }, skipWaiting: async () => { activated = true; }, clients: { claim() {} } },
    caches: { open: async () => ({ put: async (url, response) => stored.set(String(url), response), match: async url => stored.get(String(url))?.clone() }),
      keys: async () => ['koala-inline-/Schulkoala/-old', 'koala-inline-/Schulkoala/-' + result.version, 'koala-inline-/Other/-old', 'user-audio'],
      delete: async key => { deleted.push(key); } },
    fetch: async url => {
      calls.push(String(url));
      if (offline) throw new Error('offline');
      const name = new URL(url).pathname.split('/').pop() || 'index.html';
      if (new URL(url).pathname.endsWith('/index.html')) throw new Error('Cloudflare redirects index.html');
      return new Response(name, { headers: { 'Content-Type': invalid ? 'text/plain' : name.endsWith('.png') ? 'image/png' : name.endsWith('.html') ? 'text/html' : 'application/manifest+json' } });
    }
  });
  vm.runInContext(worker, context);
  const lifecycle = event => { let task; handlers[event]({ waitUntil: promise => { task = promise; } }); return task; };
   const fetch = (path, options) => { let response; handlers.fetch({ request: new Request(new URL(path, root), options), respondWith: promise => { response = promise; } }); return response; };
  return { stored, deleted, calls, lifecycle, fetch, get activated() { return activated; }, goOffline() { offline = true; } };
}

test('Generierter Worker startet offline mit Query/Unterpfad und trennt fremde Caches', async () => {
  const sw = workerContext();
  await sw.lifecycle('install');
  assert.equal(sw.activated, true);
  assert.equal(sw.stored.size, 6);
  assert.ok(sw.calls.includes('https://example.com/Schulkoala/'));
  sw.goOffline();
  for (const path of ['./?audio-test', 'index.html?audio-test']) assert.equal(await (await sw.fetch(path)).text(), 'index.html');
  for (const path of ['missing.mp3', 'missing.js', '../Other/', 'https://elsewhere.test/']) assert.equal(sw.fetch(path), undefined);
  await sw.lifecycle('activate');
  assert.deepEqual(sw.deleted, ['koala-inline-/Schulkoala/-old']);
});

test('Versionierte MP3s funktionieren offline einschließlich Umlautpfaden und Range-Requests', async () => {
  const sw = workerContext();
  const path = `audio/${result.version}/w.bär.mp3`;
  sw.stored.set(new URL(path, 'https://example.com/Schulkoala/').href,
    new Response(new Uint8Array([0, 1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/mpeg' } }));
  sw.goOffline();
  assert.equal((await sw.fetch(path)).status, 200);
  const part = await sw.fetch(path, { headers: { Range: 'bytes=1-3' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('Content-Range'), 'bytes 1-3/5');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [1, 2, 3]);
  assert.equal((await sw.fetch(path, { headers: { Range: 'bytes=5-' } })).status, 416);
  assert.equal((await sw.fetch(path, { cache: 'reload' })).status, 503);
  assert.equal((await sw.fetch(`audio/${result.version}/missing.mp3`)).status, 503);
});

test('Fehlerhafte Offline-Dateien verhindern die Aktivierung und werden nicht gecacht', async () => {
  const sw = workerContext({ invalid: true });
  await assert.rejects(sw.lifecycle('install'), /Offline-Datei fehlt/);
  assert.equal(sw.activated, false);
  assert.equal(sw.stored.size, 0);
});
