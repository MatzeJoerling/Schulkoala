import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
// Nur die deklarativen Inhalte und den vorhandenen Aufnahme-Katalog auswerten.
const contents = html.slice(html.indexOf('const LETTERS ='), html.indexOf('/* ================= Speicher'));
const shapes = html.match(/const SHAPES = .*;/)[0];
const groups = html.slice(html.indexOf('function recGroups()'), html.indexOf('function recRow('));
const all = runInNewContext(`${contents}\n${shapes}\n${groups}\nrecGroups().flatMap(g => g.items)`, {}, { timeout: 1000 });
const phrases = 'wieviele wie_viel_ist plus tippe_buchstabe womit an nochmal richtig das_ist wie faengt_mit hinweis wer neu geschafft sticker praise0 praise1 praise2 praise3 praise4'.split(' ');
const keys = new Set([
  ...phrases.map(k => 'ph.' + k), ...[1, 2, 3, 4, 5].map(n => 'n.' + n),
  'l.A', 'w.apfel', 'w.affe', 'w.ameise', 'w.koala', 'w.dino', 'fo.kreis', 'w.kreis',
  ...all.filter(it => /^(st|cl|cs|sp)\.c1\./.test(it.k)).map(it => it.k)
]);
const settings = {
  voice_id: 'XJ2fW4ybq7HouelYYGcL', voice_name: 'Cherry Twinkle - Bubbly and Sweet',
  model_id: 'eleven_multilingual_v2', output_format: 'mp3_22050_32',
  voice_settings: { stability: 0.75, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.9 }
};
const selected = all.filter(it => keys.has(it.k));
if (selected.length !== keys.size) throw new Error('Pilot-Schlüssel fehlen oder sind doppelt.');
selected.push({ k: 'demo.satz', say: 'Wie viel ist drei plus zwei?' });
const clips = selected.map(it => ({
  key: it.k, text: it.say, file: it.k + '.mp3',
  fingerprint: createHash('sha256').update(JSON.stringify({ ...settings, text: it.say })).digest('hex')
}));
const output = resolve(root, 'audio/cherry/pilot-v1');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'catalog.json'), JSON.stringify({ version: 1, ...settings, clips }, null, 2) + '\n');
console.log(`${clips.length} Clips, ${clips.reduce((n, c) => n + [...c.text].length, 0)} Zeichen → audio/cherry/pilot-v1/catalog.json`);
