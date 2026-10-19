# Schulkoala – Koala-Detektei

Lern-Detektivspiel für Erstklässler: Zahlen bis 100 (im Elternbereich einstellbar), Plus und Minus, Buchstaben. Läuft im Browser und funktioniert nach dem ersten Öffnen auch ohne Internet. Der Spielstand bleibt nur auf dem Gerät.

**[Spiel öffnen](https://schulkoala.sweet-credit-b28c.workers.dev/)**

- Zehn Detektivfälle, eine Übungsrunde und ein Sticker-Album.
- 16 Aufgabentypen mit vier Zahlenräumen und drei Lernstufen.
- Deutsche Sprachausgabe mit Ela, eigene Sprachaufnahmen und Gerätestimme als Rückfall.
- Installierbare Web-App mit Offline-Modus; zusätzlich als einzelne HTML-Datei baubar.
- Statische Anwendung mit HTML, CSS und JavaScript, ohne Anwendungsserver.

## Schnellstart

Voraussetzungen: **Node.js 22 oder neuer**, npm, Python 3, `ffmpeg`, `ffprobe` und ein eigener ElevenLabs-API-Schlüssel für die Spracherzeugung.

```sh
git clone https://github.com/MatzeJoerling/Schulkoala.git
cd Schulkoala
npm ci

# .env öffnen und ELEVENLABS_API_KEY eintragen:
cp .env.example .env

# Optional vorher voice_id, voice_name und Tempo in audio-profile.json ändern.
node scripts/export-audio-catalog.mjs
python3 scripts/generate-audio.py                 # Vorschau ohne API-Aufrufe
python3 scripts/generate-audio.py --generate      # Kostenpflichtige Erzeugung

npm test
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist/web
```

Dann **http://localhost:8000/** öffnen. **Generierte Audiodateien sind nicht im Repository enthalten.** Nach einem frischen Clone müssen sie mit der gewünschten Stimme erzeugt werden, bevor Tests und Build vollständig durchlaufen. Der Generator aktualisiert dabei auch das Manifest mit den neuen Prüfsummen. Ein Cloudflare-Konto ist nur zum Veröffentlichen auf Cloudflare nötig; beim Spielen und Bauen wird kein ElevenLabs-Schlüssel verwendet.

## Projektstruktur

| Pfad | Inhalt |
| --- | --- |
| `index.html` | Spieloberfläche, Styles, Aufgaben und Spiellogik |
| `audio-pack.js`, `sw.js` | Sprachpaket-Konfiguration und Service Worker der ungebündelten Quellversion |
| `audio-profile.json` | Stimme, Audioformat, Wiedergabe-Gain und aktives Paketverzeichnis |
| `audio/ela/full-v1/` | Katalog und Manifest des aktiven Sprachpakets; MP3s werden lokal erzeugt |
| `audio/cherry/`, `audio/ela/pilot-v1/`, `audio-samples/` | Metadaten früherer Sprachpakete und Hörproben; vorhandene lokale MP3s können wiederverwendet werden |
| `scripts/` | Build, Katalogexport, Sprachgenerator und Offline-Worker-Vorlage |
| `tests/` | Automatisierte Audio-, Aufgaben- und Build-Prüfungen |
| `manifest.webmanifest`, `icon-*.png` | App-Manifest und Icons |
| `wrangler.jsonc` | Cloudflare-Konfiguration für `dist/web/` |
| `dist/` | Generierte Web-Version und Einzeldatei; durch Git ignoriert |

### Was gehört in Git?

Quellcode, Tests, `package.json`, **`package-lock.json`**, Audio-Profil, Kataloge und Manifeste werden versioniert. **MP3-Dateien bleiben lokal und werden durch Git ignoriert**, auch Hörproben und ältere Sprachpakete. Wer das Projekt cloned, wählt seine Stimme und erzeugt das Paket selbst. Ein Git-Push enthält dadurch keine neuen Audio-Binärdateien; eine Git-LFS-Konfiguration ist nicht nötig.

Die `.gitignore` schließt lokale Zugangsdaten (`.env`, `.dev.vars`), Agent-Konfigurationen und Skills (`.agents/`, `.pi/`, `skills-lock.json`), Abhängigkeiten, Build-Ausgaben, Wrangler-Caches, Audio-Erzeugungsbelege (`.receipts/`) sowie temporäre und Editor-Dateien aus. `.env.example` ist eine Vorlage ohne Zugangsdaten und darf committed werden.

## Sprachausgabe und Standardstimme

**Los geht’s** öffnet das reguläre Spiel: alle zehn Fälle, die Übungsrunde und das Sticker-Album. Die frühere Testseite ist entfernt; auch alte Links mit `?audio-test` führen zur normalen Startseite.

Der Katalog umfasst **994 Clips**. Das bisher lokal erzeugte Ela-Paket umfasst rund **48,35 MB**; Größe und Dauer eines neu erzeugten Pakets hängen von Stimme und Einstellungen ab. Darunter sind **580 vorbereitete, zusammenhängende Ansagen** für Buchstabeneinführungen, Wortaufgaben, Hilfen, Antworten, Hinweise und Belohnungen. Variable Rechenaufgaben verwenden weiterhin wiederverwendbare Zahlen und Satzteile. Zählhilfen warten das gesprochene Wort ab, bevor sie weiterzählen.

Voreinstellung: **Ela – Cheerful and Happy**, ElevenLabs-ID `NE7AIW5DoJ7lUosXV2KR`, Deutsch mit Standardakzent. Format: **Mono, 22.050 Hz, 128 kbit/s**, Tempo **0,8**, Wiedergabe-Gain `0.7` (rund −3,1 dB). Die Stimme lässt sich vor der Erzeugung in `audio-profile.json` austauschen.

Eigene Aufnahmen haben Vorrang vor Ela. Ein vorbereiteter ganzer Satz wird nur verwendet, wenn keiner seiner Bausteine eine eigene Aufnahme hat. Bei defekten Satzclips werden die ursprünglichen Bausteine versucht; bei fehlendem Audio bleibt die Gerätestimme als Rückfall verfügbar. Buchstabenlaute (anders als Buchstabennamen) können weiterhin selbst aufgenommen werden. Der individuelle Name erscheint auf dem Bildschirm; Ela begrüßt mit „Hallo! Welchen Fall wollen wir heute lösen?“, ohne einen Stimmenwechsel für den Namen.

Als Paketverzeichnis ist **`audio/ela/full-v1/`** eingestellt. Es kann auch mit einer anderen Stimme neu erzeugt werden. Frühere Ela-/Cherry-Metadaten bleiben im Repository; der Web-Build enthält ausschließlich die lokal vorhandenen Audiodateien des aktiven Pakets.

### Auf dem iPad und offline testen

1. Die veröffentlichte HTTPS-Seite in Safari öffnen; optional über **Teilen → Zum Home-Bildschirm** installieren.
   Nach einem Update gegebenenfalls erneut laden, bis die normale Startseite ohne Testknopf erscheint. Ein bereits aktiver Offline-Worker kann zunächst noch die vorige Seite anzeigen.
2. In der verwendeten Ansicht (Safari oder installierte App) auf der Startseite **„Offline bereit ✓ · 994 Clips“** abwarten. Die Web-Version lädt und prüft das gesamte Sprachpaket automatisch. Spielen ist schon während des Downloads möglich; die Statusanzeige und ein Wiederholen-Knopf stehen auch unter **Elternbereich → Stimme** bereit.
3. Einen Fall durchspielen. Auch falsche Antworten, 🔊, Stummschalten und schnelle Bildschirmwechsel ausprobieren.
4. Flugmodus einschalten, die Seite/App erneut öffnen und weiterspielen.

Das Offline-Signal erscheint erst, wenn die Dateien der aktuellen Build-Version im Cache liegen und der passende Service Worker die Seite übernommen hat. Browserdaten können vom Gerät gelöscht werden; danach die Seite erneut online öffnen. Eigene Aufnahmen liegen separat in IndexedDB auf dem Gerät.

## Einzeldatei bauen

Voraussetzung: **Node.js 22 oder neuer** und ein vollständig lokal erzeugtes Sprachpaket (siehe Schnellstart). Der Build benötigt keine npm-Pakete und erzeugt keine neuen Sprachaufnahmen:

```sh
npm run build
```

Es entstehen zwei Ausgaben:

| Ausgabe | Verwendung |
| --- | --- |
| `dist/standalone/index.html` | Eine einzige HTML-Datei mit CSS, JavaScript, Icons und allen 994 MP3s, mit der bisherigen Ela-Stimme rund **62 MiB**. Zum lokalen Öffnen; keine weiteren Dateien nötig. |
| `dist/web/` | Cloudflare-Version mit kleiner HTML-Datei, Service Worker, App-Manifest, drei Icons und einem versionierten Audio-Unterordner. Insgesamt **1.001 Dateien**. |

In der Einzeldatei werden die MP3-Daten unverändert als Base64 eingebettet (etwa ein Drittel größer). Für Cloudflare werden sie separat ausgeliefert und offline gespeichert, da einzelne statische Dateien dort höchstens 25 MiB groß sein dürfen. Der Build prüft Audio-Dateigrößen, SHA-256-Prüfsummen und die Dateigrößenbegrenzung. Die Version wird aus den Inhalten berechnet; Änderungen erhalten automatisch neue Cache- und Audio-Pfade.

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

Für eine Prüfung ohne Veröffentlichung:

```sh
npm run build
npx wrangler deploy --dry-run
```

Der ElevenLabs-Schlüssel gehört nur in die lokale `.env` (ignoriert durch Git), nicht in die Webseite. `.env`, Quellen, Hörproben und Generator-Skripte werden nicht hochgeladen. Beim Spielen werden keine ElevenLabs-Anfragen gestellt und keine weiteren Generierungskosten verursacht. Cloudflare-Anmeldedaten verwaltet Wrangler außerhalb der Web-Dateien.

Spielstände sind an Browser und Website-Adresse gebunden. Zum Umzug von einer bisherigen Adresse die Sicherung im Elternbereich exportieren und auf der neuen Seite importieren; eigene Sprachaufnahmen sind in dieser Sicherung nicht enthalten.

### Alternativ: GitHub Pages

Auch das lokal gebaute `dist/web/` kann als statische Seite veröffentlicht werden, einschließlich aller Begleitdateien. Relative Pfade unterstützen Repository-Unterordner. Die Quellversion im Repository-Root ist nach der Audio-Erzeugung ebenfalls direkt startbar; dort werden MP3s einzeln geladen und in einem separaten Sprachcache gespeichert. Den reinen Git-Stand ohne Audiodateien zu veröffentlichen liefert kein vollständiges Sprachpaket.

Nur für die ungebündelte Quellversion gilt: Bei HTML-/JavaScript-Änderungen die Shell-Version `V` in `sw.js` erhöhen. Die erzeugte Web-Version verwaltet ihre Version automatisch. Nach einem Update die Seite erneut öffnen, damit neuer Worker und neue Seite zusammen verwendet werden.

## Lokal starten

```sh
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist/web
```

Dann `http://localhost:8000/` öffnen. Für die installierbare Web-Version benötigen Service Worker und Offline-Cache HTTPS oder localhost. `dist/standalone/index.html` ist dagegen für das direkte Öffnen ohne Server vorgesehen und registriert keinen Service Worker.

## Stimme wählen und Sprachpaket erzeugen

Voraussetzungen für die Erzeugung: Node.js, Python 3, `ffmpeg`, `ffprobe` und ein lokaler `ELEVENLABS_API_KEY` in Umgebung oder `.env`.

Für eine lokale `.env` die mitgelieferte `.env.example` kopieren und den eigenen Schlüssel eintragen:

```sh
cp .env.example .env
```

Vor dem Katalogexport in **`audio-profile.json`** die gewünschte ElevenLabs-`voice_id` und den zugehörigen `voice_name` eintragen. Optional `voice_settings.speed` und weitere Einstellungen anpassen. Das bisherige `pack`-Verzeichnis kann dabei unverändert bleiben; sein Name legt die Stimme nicht fest. `.env` bleibt lokal.

```sh
# Texte und Schlüssel aus index.html exportieren:
node scripts/export-audio-catalog.mjs

# Vorhandene Dateien prüfen und fehlende Zeichen anzeigen (keine API-Aufrufe):
python3 scripts/generate-audio.py

# Nur fehlende/geänderte Clips erzeugen (kostenpflichtige API-Aufrufe):
python3 scripts/generate-audio.py --generate

# Auf einen Schlüssel begrenzen:
python3 scripts/generate-audio.py --generate --only sentence.plus.3.2
```

**`audio-profile.json`** enthält Stimme, Modell, Tempo, Zielformat, Wiedergabe-Gain und Paketverzeichnis. Der Exporter erfasst den gesamten Sprachbestand der Anwendung sowie die vorbereiteten Satzfolgen. Der Generator verwendet `eleven_multilingual_v2`, Stabilität `0.75`, Ähnlichkeit `0.75`, Stil `0`, Speaker Boost und Sprechtempo `0.8`. Die API liefert `mp3_44100_128`; FFmpeg wandelt das anschließend in Mono, 22.050 Hz und 128 kbit/s um. Die API-Originaldateien bleiben lokal im ignorierten Verzeichnis `.receipts/` erhalten.

Texte, Stimme und Erzeugungseinstellungen werden per Fingerprint geprüft. Bereits lokal vorhandene, unveränderte Dateien werden anhand des Manifests bzw. lokaler Belege wiederverwendet. Identische Aufnahmen aus früheren Ela-Paketen werden nur übernommen, wenn ihre MP3s lokal vorhanden sind und Prüfsumme sowie Format stimmen. Nach einem frischen Clone fehlen alle MP3s, daher wird das gesamte aktive Paket neu erzeugt. Maximal zwei API-Aufrufe laufen gleichzeitig. Erst ein vollständig geprüftes Paket erhält ein neues Manifest. `playback_gain` gehört nicht zum Erzeugungs-Fingerprint: Eine reine Lautstärkeänderung benötigt nur Katalogexport, `--generate` zur Manifest-Aktualisierung (bei unveränderten Clips ohne API-Aufruf) und einen neuen Build.

Für eine andere Stimme oder ein anderes Tempo das Profil ändern und die Befehle oben erneut ausführen. Für ein separates Paket auch `pack` sowie die Quellseiten-Pfade in `audio-pack.js` ändern. Build und Generator lesen den Paketpfad aus dem Profil. Die Satzdefinitionen stehen im Katalogexporter; `replaces` ordnet vollständige Aufnahmen ihren ursprünglichen Bausteinen zu.

Danach `npm test` und `npm run build` ausführen. Das Manifest wird mitversioniert; erzeugte MP3s und API-Originaldateien bleiben durch `.gitignore` ausgeschlossen. Die komplette Spracherzeugung verursacht ElevenLabs-Kosten; die Vorschau zeigt vorab die zu erzeugenden Zeichen und stellt keine API-Anfragen.

## Prüfungen

Für die vollständigen Audio- und Build-Tests muss das Sprachpaket zuvor lokal erzeugt sein.

```sh
npm test
python3 scripts/generate-audio.py
```

Die automatisierten Tests prüfen Katalog, Profil, Dateigrößen und SHA-256-Prüfsummen, JavaScript-Syntax, Offline-Audio inklusive Byte-Ranges und Umlautpfaden, Cache-Reparatur und die Trennung fremder Caches. Dazu kommen Satzpriorität, Ausfälle und Abbruch, eingebettete Audio-/Icon-Bytes, reproduzierbare Builds und Cloudflare-Dateigrenzen. Ein deterministischer Abdeckungstest erzeugt **7.680 Aufgaben** über alle 16 Typen, vier Zahlenräume und drei Lernstufen und prüft ihre Sprachschlüssel einschließlich Hilfen. Alle Fälle, Buchstaben, Wörter und Sticker sowie das Entfernen der Testoberfläche sind ebenfalls abgesichert. Der Generator prüft MP3-Format und vollständige Decodierbarkeit aller Dateien.

Für die Hörprobe und den Offline-Test auf einem echten iPad die Schritte unter „Auf dem iPad und offline testen“ verwenden.
