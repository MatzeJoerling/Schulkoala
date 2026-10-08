import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const html = await read('index.html');
const profile = JSON.parse(await read('audio-profile.json'));
const catalog = JSON.parse(await read(profile.pack + '/catalog.json'));
const keys = new Set(catalog.clips.map(c => c.key));
let seed = 47, active;
const math = Object.create(Math);
math.random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
const element = data => ({ dataset: data || {}, style: {}, isConnected: true, classList: { add() {}, remove() {} }, insertAdjacentHTML() {}, children: [], querySelectorAll: () => [] });
const document = { querySelector: () => element(), querySelectorAll: selector =>
  selector === '#opts .tile' ? active.opts.map(o => element({ v: String(o.v) })) : [] };
function covered(segs) {
  for (const s of segs) if (s.t !== '?' && !s.k?.startsWith('s.')) {
    assert.ok(s.k && keys.has(s.k), 'Fehlende Aufnahme: ' + JSON.stringify(s));
    assert.ok(s.t.trim(), 'Leerer Sprachtext');
  }
}
const code = html.slice(html.indexOf('const $ ='), html.indexOf('/* ================= Aufnahmen'))
  + html.slice(html.indexOf('const P = k =>'), html.indexOf('/* ================= Klänge'))
  + html.slice(html.indexOf('/* ================= Aufgaben-Erzeuger'), html.indexOf('/* ================= Bildschirme'));
const ctx = vm.createContext({ document, Math: math, setTimeout: fn => fn(), CLIPS: new Map(), HT: 0,
  localStorage: { setItem() {} }, speak: async segs => covered(segs) });
vm.runInContext(code, ctx);
const app = vm.runInContext('({GEN,S,LETTERS,WORDS,CASES,STICKERS,P,N,Wd,Lt,Q})', ctx);

test('Alle 16 Aufgabentypen haben Ela-Texte in sämtlichen Zahlenräumen und Lernstufen', async () => {
  app.S.unlocked = Object.fromEntries(app.LETTERS.map(l => [l, 1]));
  assert.equal(Object.keys(app.GEN).length, 16);
  for (const range of [10, 20, 50, 100]) for (const lv of [1, 2, 3]) {
    app.S.set.range = range;
    for (const type of Object.keys(app.GEN)) {
      app.S.sk[type] = { lv };
      for (let i = 0; i < 40; i++) {
        active = app.GEN[type]({});
        covered(active.segs);
        covered(active.reveal.length ? [app.P('richtig'), ...active.reveal] : [app.P('markiert')]);
        if (active.hint) await active.hint();
      }
    }
  }
});

test('Alle Geschichten, Sticker, Buchstaben und Wörter sind enthalten; der Pilot ist entfernt', () => {
  for (const c of app.CASES) {
    for (const part of ['in', 'out']) for (let i = 0; i < 2; i++) assert.ok(keys.has(`st.${c.id}.${part}.${i}`));
    for (let i = 0; i < 5; i++) for (const prefix of ['sentence.clue.', 'sentence.review.']) assert.ok(keys.has(`${prefix}${c.id}.${i}`));
    for (const suspect of c.suspects.filter(s => s.id !== c.culprit)) assert.ok(keys.has(`sp.${c.id}.${suspect.id}`));
  }
  for (const l of app.LETTERS) for (const prefix of ['sentence.intro.', 'sentence.tippe.', 'sentence.finde.', 'sentence.bild.']) assert.ok(keys.has(prefix + l));
  for (const word of [...Object.values(app.WORDS).flat(), ...app.STICKERS]) covered([app.Wd(word[0])]);
  for (let n = 0; n <= 100; n++) covered([app.N(n)]);
  covered([app.P('willkommen')]);
  assert.doesNotMatch(html, /pilotStart|audioTest|Probefall|Testpaket|endPilot|SES\.pilot/);
});
