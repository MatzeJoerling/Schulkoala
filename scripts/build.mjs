import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PACK = 'audio/cherry/pilot-v1';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const dataUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;

function insert(text, token, value) {
  if (text.split(token).length !== 2) throw new Error(`Expected exactly one ${token}`);
  return text.replace(token, () => value);
}

export async function build({ outputDir = join(ROOT, 'dist') } = {}) {
  const read = name => readFile(join(ROOT, name));
  const [source, manifestBytes, audioManifestBytes, workerTemplate, builder] = await Promise.all([
    read('index.html'), read('manifest.webmanifest'), read(`${PACK}/manifest.json`),
    read('scripts/offline-sw.js'), read('scripts/build.mjs')
  ]);
  const manifest = JSON.parse(audioManifestBytes);
  if (!Array.isArray(manifest.clips) || !manifest.clips.length) throw new Error('Empty audio pack');
  const clips = {}, icons = new Map();
  let audioBytes = 0;
  for (const clip of manifest.clips) {
    if (!/^[\w.-]+\.mp3$/.test(clip.file) || Object.hasOwn(clips, clip.key)) throw new Error('Invalid audio entry');
    const bytes = await read(`${PACK}/${clip.file}`);
    if (bytes.length !== clip.bytes || digest(bytes) !== clip.sha256) throw new Error(`Invalid audio: ${clip.key}`);
    clips[clip.key] = dataUrl('audio/mpeg', bytes);
    audioBytes += bytes.length;
  }
  if (audioBytes !== manifest.total_bytes) throw new Error('Audio total does not match');
  for (const name of ['icon-180.png', 'icon-192.png', 'icon-512.png']) icons.set(name, await read(name));
  for (const icon of JSON.parse(manifestBytes).icons) {
    if (!icons.has(icon.src)) throw new Error(`Missing manifest icon: ${icon.src}`);
  }
  const hash = createHash('sha256');
  for (const bytes of [source, manifestBytes, audioManifestBytes, workerTemplate, builder, ...icons.values()]) hash.update(bytes.length + '\0').update(bytes);
  // Manifest contains SHA-256 hashes of all audio bytes verified above.
  const version = hash.digest('hex').slice(0, 16);
  const shellFiles = ['index.html', 'manifest.webmanifest', ...icons.keys()];
  const render = standalone => {
    const config = { embedded: { manifest, clips }, standalone, webVersion: version, shellFiles };
    let html = insert(source.toString(), '<script src="./audio-pack.js"></script>', `<script>const AUDIO_PACK = Object.freeze(${json(config)});</script>`);
    for (const [name, bytes] of icons) html = html.replaceAll(`href="${name}"`, `href="${dataUrl('image/png', bytes)}"`);
    if (standalone) html = insert(html, '<link rel="manifest" href="manifest.webmanifest">\n', '');
    for (const [i, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) new Script(match[1], { filename: `inline-${i}.js` });
    return html;
  };
  const webHtml = render(false), standaloneHtml = render(true);
  const worker = insert(insert(workerTemplate.toString(), '{{VERSION}}', version), '{{FILES}}', json(shellFiles));
  new Script(worker, { filename: 'sw.js' });
  const webFiles = new Map([
    ['index.html', Buffer.from(webHtml)], ['sw.js', Buffer.from(worker)],
    ['manifest.webmanifest', manifestBytes], ...icons
  ]);
  const webDir = join(outputDir, 'web'), standaloneDir = join(outputDir, 'standalone');
  // Only replace generated directories, after validating all inputs.
  await Promise.all([rm(webDir, { recursive: true, force: true }), rm(standaloneDir, { recursive: true, force: true })]);
  for (const [name, bytes] of webFiles) {
    const target = join(webDir, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  await mkdir(standaloneDir, { recursive: true });
  await writeFile(join(standaloneDir, 'index.html'), standaloneHtml);
  return { version, webDir, standaloneDir, standaloneBytes: Buffer.byteLength(standaloneHtml), clips: manifest.clips.length };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const result = await build();
  console.log(`Einzeldatei: ${join(result.standaloneDir, 'index.html')} (${(result.standaloneBytes / 1024 / 1024).toFixed(2)} MiB, ${result.clips} Clips)`);
  console.log(`Cloudflare:  ${result.webDir}\nVersion:     ${result.version}`);
}
