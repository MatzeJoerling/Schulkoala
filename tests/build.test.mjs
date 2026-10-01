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
  config = vm.runInNewContext(code + '; AUDIO_PACK');
});
after(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

test('Einzeldatei enthält alle Audio- und Icon-Bytes; keine externen Dateien nötig', async () => {
  assert.deepEqual(await readdir(result.standaloneDir), ['index.html']);
  assert.equal(config.standalone, true);
  assert.equal(config.embedded.manifest.clips.length, 51);
  for (const clip of config.embedded.manifest.clips) {
    const url = config.embedded.clips[clip.key];
    assert.ok(url.startsWith('data:audio/mpeg;base64,'));
    const original = await readFile(new URL('../audio/cherry/pilot-v1/' + clip.file, import.meta.url));
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
  const previous = new Map(await Promise.all((await readdir(result.webDir)).map(async name => [name, await readFile(join(result.webDir, name))])));
  const again = await build({ outputDir: temp });
  assert.equal(again.version, result.version);
  assert.deepEqual([...previous.keys()].sort(), ['icon-180.png', 'icon-192.png', 'icon-512.png', 'index.html', 'manifest.webmanifest', 'sw.js']);
  for (const [name, bytes] of previous) assert.deepEqual(await readFile(join(result.webDir, name)), bytes);
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
  const fetch = path => { let response; handlers.fetch({ request: new Request(new URL(path, root)), respondWith: promise => { response = promise; } }); return response; };
  return { stored, deleted, calls, lifecycle, fetch, get activated() { return activated; }, goOffline() { offline = true; } };
}

test('Generierter Worker startet offline mit Query/Unterpfad und trennt fremde Caches', async () => {
  const sw = workerContext();
  await sw.lifecycle('install');
  assert.equal(sw.activated, true);
  assert.equal(sw.stored.size, 5);
  assert.ok(sw.calls.includes('https://example.com/Schulkoala/'));
  sw.goOffline();
  for (const path of ['./?audio-test', 'index.html?audio-test']) assert.equal(await (await sw.fetch(path)).text(), 'index.html');
  for (const path of ['missing.mp3', 'missing.js', '../Other/', 'https://elsewhere.test/']) assert.equal(sw.fetch(path), undefined);
  await sw.lifecycle('activate');
  assert.deepEqual(sw.deleted, ['koala-inline-/Schulkoala/-old']);
});

test('Fehlerhafte Offline-Dateien verhindern die Aktivierung und werden nicht gecacht', async () => {
  const sw = workerContext({ invalid: true });
  await assert.rejects(sw.lifecycle('install'), /Offline-Datei fehlt/);
  assert.equal(sw.activated, false);
  assert.equal(sw.stored.size, 0);
});
