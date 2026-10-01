# Koala-Detektei

Lern-Detektivspiel für Erstklässler: Zahlen bis 100 (im Elternbereich einstellbar), Plus und Minus, Buchstaben. Läuft im Browser und funktioniert nach dem ersten Öffnen auch ohne Internet. Der Spielstand bleibt nur auf dem Gerät.

## Cherry-Stimme ausprobieren

Auf der Startseite **🎧 Cherry-Stimme testen** wählen. Direktlink: `./?audio-test`.

- **Ganzer Satz:** „Wie viel ist drei plus zwei?“ als zusammenhängende Aufnahme.
- **Aus Bausteinen:** derselbe Satz aus vier einzeln erzeugten Clips.
- **Probefall starten:** Buchstabe A kennenlernen, fünf Aufgaben (Zählen, 3 + 2, Buchstabe A, Anlaut von Apfel, Kreis), fünf Hinweise, Tätersuche, Auflösung und Dino-Sticker. Falsche Antworten, Hilfen, Wiederholung und Sticker-Album sind ebenfalls vertont. Der Probefall verändert den gespeicherten Lernstand nicht.

Die 51 MP3-Dateien belegen zusammen **479.274 Bytes (rund 479 kB)**: **Mono, 22.050 Hz, 32 kbit/s**. Stimme: **Cherry Twinkle – Bubbly and Sweet**, KI-generiert mit ElevenLabs. Die Sprachausgabe verwendet zuerst eigene Aufnahmen, dann die mitgelieferten Cherry-Clips und bei fehlenden oder defekten Clips die Gerätestimme. Außerhalb des Probefalls ist Cherry bisher nur für die enthaltenen Textbausteine verfügbar. Individuelle Namen bleiben bei der Gerätestimme.

### Auf dem iPad und offline testen

1. Die veröffentlichte HTTPS-Seite in Safari öffnen; optional über **Teilen → Zum Home-Bildschirm** installieren.
2. In der verwendeten Ansicht (Safari oder installierte App) **Cherry-Stimme testen** öffnen und **„Offline bereit ✓ · 51 Clips“** abwarten. Die Web-Version speichert die gesamte HTML-Datei mit den eingebetteten Aufnahmen automatisch für den Offline-Start.
3. Beide Hörproben vergleichen, dann den Probefall durchspielen. Auch falsche Antworten, 🔊, Stummschalten und schnelle Bildschirmwechsel ausprobieren.
4. Flugmodus einschalten, die Seite/App erneut öffnen und den Probefall wiederholen.

Das Offline-Signal erscheint erst, wenn die Dateien der aktuellen Build-Version im Cache liegen und der passende Service Worker die Seite übernommen hat. Browserdaten können vom Gerät gelöscht werden; danach die Seite erneut online öffnen. Eigene Aufnahmen liegen separat in IndexedDB auf dem Gerät.

## Einzeldatei bauen

Voraussetzung: **Node.js 22 oder neuer**. Der Build benötigt keine npm-Pakete und erzeugt keine neuen Sprachaufnahmen:

```sh
npm run build
```

Nach dem Muster von `../zauberdetektei` entstehen zwei Ausgaben:

| Ausgabe | Verwendung |
| --- | --- |
| `dist/standalone/index.html` | Eine einzige HTML-Datei mit CSS, JavaScript, Icons und allen 51 Cherry-MP3s, insgesamt rund **0,79 MiB**. Zum Kopieren oder Verschicken; keine weiteren Dateien nötig. |
| `dist/web/` | Cloudflare-Version: dieselben eingebetteten Spielinhalte sowie Service Worker, App-Manifest und drei App-Icons für Offline-Start und Installation. Insgesamt sechs Dateien. |

Die MP3-Daten werden unverändert als Base64 eingebettet (etwa ein Drittel größer als die MP3-Dateien selbst). Format und Klang bleiben Mono, 22.050 Hz und 32 kbit/s. Der Build prüft alle Audio-Dateigrößen und SHA-256-Prüfsummen vor dem Einbetten. Die Offline-Version wird aus den Inhalten berechnet; Änderungen erhalten automatisch eine neue Cache-Version.

`dist/` ist generiert und wird nicht in Git gespeichert. Änderungen gehören in die ursprüngliche `index.html`, `audio/` oder die Build-Skripte. Der Build ersetzt ausschließlich `dist/web/` und `dist/standalone/`.

Die Einzeldatei lässt sich auf einem Desktop direkt im Browser öffnen. Auf dem iPad ist die Vorschau in „Dateien“ oder Mail nicht automatisch ein Browser, der das Spiel ausführt. Für Safari und „Zum Home-Bildschirm“ die veröffentlichte HTTPS-Web-Version verwenden. Ein Service Worker benötigt eine eigene HTTP(S)-Adresse; er lässt sich nicht als Inline-Script in einer einzelnen HTML-Datei registrieren. Daher die kleinen Begleitdateien der Web-Version.

## Auf Cloudflare veröffentlichen

Einmalig die festgelegten Abhängigkeiten installieren und bei Bedarf anmelden:

```sh
npm ci
npx wrangler login
```

Danach:

```sh
npm run deploy
```

Dieser Befehl baut beide Varianten und veröffentlicht ausschließlich **`dist/web/`** als statische Assets des Workers **`schulkoala`** aus `wrangler.jsonc`. Wrangler gibt anschließend die öffentliche HTTPS-Adresse aus. Der lokale Stand wird veröffentlicht; ein Git-Push ist dafür nicht erforderlich.

**Spiel:** https://schulkoala.sweet-credit-b28c.workers.dev/

**Direkt zur Hörprobe:** https://schulkoala.sweet-credit-b28c.workers.dev/?audio-test

Für eine Prüfung ohne Veröffentlichung:

```sh
npm run build
npx wrangler deploy --dry-run
```

Der ElevenLabs-Schlüssel gehört nur in die lokale `.env` (ignoriert durch Git), nicht in die Webseite. `.env`, Quellen, Hörproben und Generator-Skripte werden nicht hochgeladen. Beim Spielen werden keine ElevenLabs-Anfragen gestellt und keine weiteren Generierungskosten verursacht. Cloudflare-Anmeldedaten verwaltet Wrangler außerhalb der Web-Dateien.

Spielstände sind an Browser und Website-Adresse gebunden. Zum Umzug von einer bisherigen Adresse die Sicherung im Elternbereich exportieren und auf der neuen Seite importieren; eigene Sprachaufnahmen sind in dieser Sicherung nicht enthalten.

### Alternativ: GitHub Pages

Auch `dist/web/` kann als statische Seite veröffentlicht werden, einschließlich aller Begleitdateien. Relative Pfade unterstützen Repository-Unterordner. Die Quellversion im Repository-Root bleibt ebenfalls direkt startbar; dort werden MP3s noch einzeln geladen und in einem separaten Sprachcache gespeichert.

Nur für die ungebündelte Quellversion gilt: Bei HTML-/JavaScript-Änderungen die Shell-Version `V` in `sw.js` erhöhen. Die erzeugte Web-Version verwaltet ihre Version automatisch. Nach einem Update die Seite erneut öffnen, damit neuer Worker und neue Seite zusammen verwendet werden.

## Lokal starten

```sh
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist/web
```

Dann `http://localhost:8000/?audio-test` öffnen. Für die installierbare Web-Version benötigen Service Worker und Offline-Cache HTTPS oder localhost. `dist/standalone/index.html` ist dagegen für das direkte Öffnen ohne Server vorgesehen und registriert keinen Service Worker.

## Sprachpaket pflegen

Voraussetzungen für die Erzeugung: Node.js, Python 3, `ffmpeg`, `ffprobe` und ein lokaler `ELEVENLABS_API_KEY` in Umgebung oder `.env`.

```sh
# Texte und Schlüssel aus index.html exportieren:
node scripts/export-audio-catalog.mjs

# Vorhandene Dateien prüfen und fehlende Zeichen anzeigen (keine API-Aufrufe):
python3 scripts/generate-audio.py

# Nur fehlende/geänderte Clips erzeugen (kostenpflichtige API-Aufrufe):
python3 scripts/generate-audio.py --generate

# Auf einen Schlüssel begrenzen:
python3 scripts/generate-audio.py --generate --only demo.satz
```

Der Generator ist auf dieses kleine Testpaket begrenzt. Er verwendet `eleven_multilingual_v2`, Stabilität `0.75`, Ähnlichkeit `0.75`, Stil `0`, Speaker Boost und Sprechtempo `0.9`. Text und Einstellungen werden per Fingerprint geprüft. Bestehende, unveränderte Dateien werden anhand des ausgelieferten Manifests bzw. lokaler Belege wiederverwendet, auch nach einem frischen Clone. Maximal zwei API-Aufrufe laufen gleichzeitig. Erst ein vollständig geprüftes Paket erhält ein neues Manifest.

## Prüfungen

```sh
npm test
python3 scripts/generate-audio.py
```

Die automatisierten Tests prüfen Katalog, Dateigrößen und SHA-256-Prüfsummen, JavaScript-Syntax, Offline-Audio inklusive Byte-Ranges, Cache-Reparatur und die Trennung von anderen Projekt-Caches. Dazu kommen Byte-Vergleiche der eingebetteten Audios/Icons, reproduzierbare Builds, die Cloudflare-Dateiauswahl und der generierte Offline-Worker einschließlich fehlerhafter Antworten. Der Generator prüft zusätzlich MP3-Format und vollständige Decodierbarkeit aller Dateien.

Der Probefall wurde in Chromium sowohl als lokale Einzeldatei (`file://`) als auch in der gebündelten Web-Version unter einem Unterpfad mit deaktiviertem Netzwerk durchgespielt: jeweils 60 erfolgreiche Clip-Wiedergaben, keine TTS-Ausweichtexte, keine JavaScript-Fehler und unveränderter gespeicherter Lernstand. Auf der veröffentlichten Cloudflare-Adresse wurden zusätzlich Offline-Bereitschaft, Neuladen ohne Netzwerk und die Hörprobe geprüft. Die reale Safari-/iPad-Hörprobe bleibt der abschließende Gerätetest.
