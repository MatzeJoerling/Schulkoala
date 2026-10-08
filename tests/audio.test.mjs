import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const config = await read('audio-pack.js'), worker = await read('sw.js');
const profile = JSON.parse(await read('audio-profile.json'));
const base = profile.pack + '/';

test('Ausgeliefertes Paket passt zum Katalog und zu allen Dateiprüfsummen', async () => {
  const catalog = JSON.parse(await read(base + 'catalog.json'));
  const manifest = JSON.parse(await read(base + 'manifest.json'));
  assert.equal(manifest.clips.length, 994);
  assert.equal(new Set(manifest.clips.map(c => c.key)).size, 994);
  assert.equal(manifest.voice_id, profile.voice_id);
  assert.equal(manifest.clips.filter(c => c.replaces).length, 580);
  assert.deepEqual(manifest.encoding, profile.encoding);
  assert.deepEqual(manifest.voice_settings, profile.voice_settings);
  const paths = vm.runInNewContext(config + '; AUDIO_PACK', { URL, self: { location: { href: 'https://example.com/Schulkoala/' } } });
  assert.equal(paths.base, './' + base);
  assert.equal(paths.manifest, './' + base + 'manifest.json');
  let bytes = 0;
  for (const clip of manifest.clips) {
    const source = catalog.clips.find(c => c.key === clip.key);
    assert.ok(source, clip.key);
    for (const field of ['text', 'file', 'fingerprint']) assert.equal(clip[field], source[field]);
    const data = await readFile(new URL(base + clip.file, root));
    assert.equal(data.length, clip.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), clip.sha256);
    bytes += data.length;
  }
  assert.equal(bytes, manifest.total_bytes);
});

test('Inline-Anwendung ist syntaktisch gültig', async () => {
  const html = await read('index.html');
  for (const [, code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(code);
});

function serviceWorker() {
  const handlers = {}, calls = [], deleted = [];
  const scope = 'https://example.github.io/Schulkoala/';
  const stored = new Map([
    [scope + base + 'demo.satz.mp3', new Response(new Uint8Array([0, 1, 2, 3, 4, 5]), { headers: { 'Content-Type': 'audio/mpeg' } })],
    [scope + 'index.html', new Response('<html>Koala</html>', { headers: { 'Content-Type': 'text/html' } })]
  ]);
  const context = vm.createContext({ URL, Request, Response, Uint8Array,
    self: { location: { href: scope + 'sw.js' }, addEventListener: (key, fn) => { handlers[key] = fn; }, clients: { claim() {} } },
    caches: {
      open: async () => ({ match: async request => stored.get(new URL(request.url || request, scope).href)?.clone() }),
      keys: async () => ['koala-shell-/Schulkoala/-v7', 'koala-shell-/Schulkoala/-v8', 'other-app-cache', 'koala-ela-full-v1-/Schulkoala/'],
      delete: async name => { deleted.push(name); }
    },
    fetch: async request => { calls.push(request); throw new Error('offline'); }
  });
  context.importScripts = () => vm.runInContext(config, context);
  vm.runInContext(worker, context);
  const fetch = (path, options) => {
    let result;
    handlers.fetch({ request: new Request(scope + path, options), respondWith: response => { result = response; } });
    return result;
  };
  return { fetch, calls, deleted, handlers };
}

test('Offline-Audio: vollständige Dateien, Byte-Ranges und ungültige Ranges', async () => {
  const sw = serviceWorker(), file = base + 'demo.satz.mp3';
  assert.equal((await sw.fetch(file)).status, 200);
  for (const [range, expected, contentRange] of [
    ['bytes=1-3', [1, 2, 3], 'bytes 1-3/6'],
    ['bytes=4-', [4, 5], 'bytes 4-5/6'],
    ['bytes=-2', [4, 5], 'bytes 4-5/6'],
    ['bytes=4-99', [4, 5], 'bytes 4-5/6']
  ]) {
    const response = await sw.fetch(file, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], expected);
  }
  for (const range of ['bytes=8-', 'bytes=3-1', 'bytes=-0']) {
    assert.equal((await sw.fetch(file, { headers: { Range: range } })).status, 416);
  }
  assert.equal(sw.calls.length, 0);
});

test('Audiofehler liefern kein HTML; Reparatur umgeht den Cache', async () => {
  const sw = serviceWorker();
  assert.equal((await sw.fetch(base + 'missing.mp3')).status, 503);
  assert.equal((await sw.fetch(base + 'demo.satz.mp3', { cache: 'reload' })).status, 503);
  assert.equal(sw.calls.length, 2);
  assert.equal((await sw.fetch('missing.js')).status, 503);
});

test('Worker übernimmt keine anderen Projekte und behält den Sprachcache', async () => {
  const sw = serviceWorker();
  assert.equal(sw.fetch('../other/index.html'), undefined);
  let activation;
  sw.handlers.activate({ waitUntil: task => { activation = task; } });
  await activation;
  assert.deepEqual(sw.deleted, ['koala-shell-/Schulkoala/-v7']);
});

test('Ganze Sätze respektieren eigene Aufnahmen, Vergleichsmodus, Ausfälle und Abbruch', async () => {
  const html = await read('index.html');
  const code = html.slice(html.indexOf('function matchingSentence('), html.indexOf('const P = k =>'));
  const catalog = JSON.parse(await read(base + 'catalog.json'));
  const own = new Map(), bundled = new Map(catalog.clips.map(c => [c.key, c.key]));
  const played = [], spoken = [], broken = new Set();
  const context = vm.createContext({
    CLIPS: own, BUNDLED: bundled, packManifest: catalog, S: { set: { speak: true } }, MUTED: false,
    spkToken: 0, audioReady: Promise.resolve(), recordingsReady: Promise.resolve(),
    sleep: async () => {}, stopSpeech: () => { context.spkToken++; return false; },
    playClip: async url => { played.push(url); return !broken.has(url); },
    ttsSay: async text => { spoken.push(text); }
  });
  vm.runInContext(code, context);
  const parts = [{ k: 'ph.wie_viel_ist', t: 'Wie viel ist' }, { k: 'n.3', t: 'drei' },
    { k: 'ph.plus', t: 'plus' }, { k: 'n.2', t: 'zwei' }, { t: '?' }];
  await context.speak(parts);
   assert.deepEqual(played.splice(0), ['sentence.plus.3.2']);
  await context.speak(parts, true, false);
  assert.deepEqual(played.splice(0), ['ph.wie_viel_ist', 'n.3', 'ph.plus', 'n.2']);
  own.set('n.3', 'own-drei');
  await context.speak(parts);
  assert.deepEqual(played.splice(0), ['ph.wie_viel_ist', 'own-drei', 'ph.plus', 'n.2']);
  own.clear(); broken.add('sentence.plus.3.2');
  await context.speak(parts);
  assert.deepEqual(played.splice(0), ['sentence.plus.3.2', 'ph.wie_viel_ist', 'n.3', 'ph.plus', 'n.2']);
  for (const key of bundled.keys()) broken.add(key);
  await context.speak(parts);
  assert.ok(spoken.join(' ').includes('drei'));
  played.length = 0;
  context.playClip = async url => { played.push(url); context.spkToken++; return false; };
  await context.speak(parts);
  assert.deepEqual(played, ['sentence.plus.3.2']);
  // Jede neue Satzdefinition muss vollständig erreichbar sein.
  for (const clip of catalog.clips.filter(c => c.replaces)) {
    const segs = clip.replaces.map(k => k === '?' ? { t: k } : { k });
    assert.equal(context.matchingSentence(segs)?.key, clip.key);
    own.set(clip.replaces[0], 'own');
    assert.equal(context.matchingSentence(segs), null);
    own.clear();
  }
});
