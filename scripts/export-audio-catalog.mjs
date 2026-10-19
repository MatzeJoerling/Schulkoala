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
const { all, letters, words, cases, forms } = runInNewContext(`${contents}\n${shapes}\n${groups}\n({all: recGroups().flatMap(g => g.items), letters: LETTERS, words: WORDS, cases: CASES, forms: SHAPES})`, {}, { timeout: 1000 });
const { pack, playback_gain, ...settings } = JSON.parse(readFileSync(resolve(root, 'audio-profile.json'), 'utf8'));
const selected = all.filter(it => it.say && it.k !== 'ph.klatsch');
const byKey = new Map(all.map(it => [it.k, it.say]));
// Vollständige Sätze für alle endlichen Sprach-/Geschichtsvarianten.
// Rechenaufgaben bleiben kombinierbar; Bausteine dienen auch eigenen Aufnahmen.
function sentence(k, replaces) {
  const say = replaces.map(key => {
    if (key === '?') return '?';
    if (!byKey.has(key)) throw new Error(`Unbekannter Satzbaustein: ${key}`);
    return byKey.get(key);
  }).join(' ').replace(/ ([?.!,])/g, '$1');
  selected.push({ k, say: /[.!?]$/.test(say) ? say : say + '.', replaces });
}
sentence('sentence.plus.3.2', ['ph.wie_viel_ist', 'n.3', 'ph.plus', 'n.2', '?']);
for (const L of letters) {
  const ws = words[L] || [], letter = 'l.' + L;
  sentence('sentence.intro.' + L, ['ph.neu', 'ph.das_ist', letter, ...(ws[0] ? ['ph.wie', 'w.' + ws[0][0].toLowerCase()] : [])]);
  sentence('sentence.tippe.' + L, ['ph.tippe_buchstabe', letter]);
  sentence('sentence.finde.' + L, ['ph.finde', letter, 'ph.finde_ende']);
  sentence('sentence.bild.' + L, ['ph.bild1', letter, 'ph.bild2']);
  if (!ws.length) sentence('sentence.hilfe.' + L, ['ph.das_ist', letter]);
  for (const [word] of ws) {
    const slug = word.toLowerCase(), w = 'w.' + slug;
    sentence('sentence.anlaut.' + slug, ['ph.womit', w, 'ph.an']);
    sentence('sentence.hilfe.' + L + '.' + slug, ['ph.das_ist', letter, 'ph.wie', w]);
    sentence('sentence.hilfe.' + slug, [w, 'ph.faengt_mit', letter]);
    sentence('sentence.silben.' + slug, ['ph.silben1', w, '?']);
  }
}
for (const key of [...Array.from({ length: 101 }, (_, n) => 'n.' + n), ...letters.map(L => 'l.' + L), ...forms.map(s => 'w.' + s[0].toLowerCase())]) {
  sentence('sentence.richtig.' + key, ['ph.richtig', key]);
}
sentence('sentence.belohnung', ['ph.geschafft', 'ph.sticker']);
sentence('sentence.belohnung.runde', ['ph.runde', 'ph.sticker']);
for (const c of cases) for (let i = 0; i < c.clues.length; i++) {
  sentence(`sentence.clue.${c.id}.${i}`, ['ph.hinweis', `cl.${c.id}.${i}`, `cs.${c.id}.${i}`]);
  sentence(`sentence.review.${c.id}.${i}`, [`cl.${c.id}.${i}`, `cs.${c.id}.${i}`]);
}
if (new Set(selected.map(it => it.k)).size !== selected.length) throw new Error('Doppelte Audio-Schlüssel.');
const clips = selected.map(it => ({
  key: it.k, text: it.say, file: it.k + '.mp3',
  ...(it.replaces ? { replaces: it.replaces } : {}),
  fingerprint: createHash('sha256').update(JSON.stringify({ ...settings, text: it.say })).digest('hex')
}));
const output = resolve(root, pack);
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'catalog.json'), JSON.stringify({ version: 2, ...settings, playback_gain, clips }, null, 2) + '\n');
console.log(`${clips.length} Clips, ${clips.reduce((n, c) => n + [...c.text].length, 0)} Zeichen → ${pack}/catalog.json`);
