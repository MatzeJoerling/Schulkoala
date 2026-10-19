#!/usr/bin/env python3
"""Lokaler, fortsetzbarer Sprachpaket-Generator. Standard: Vorschau ohne API-Aufrufe."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / json.loads((ROOT / 'audio-profile.json').read_text())['pack']


def write_json(path, value):
    temp = path.with_suffix('.json.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def probe(path, encoding):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                             '-of', 'json', str(path)], check=True, capture_output=True, text=True)
    info = json.loads(result.stdout)
    stream = info['streams'][0]
    expected = ('mp3', encoding['sample_rate'], encoding['channels'], encoding['bit_rate'])
    if (stream['codec_name'], int(stream['sample_rate']), stream['channels'], int(stream['bit_rate'])) != expected:
        raise ValueError(f'Falsches Audioformat: {path.name}')
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'],
                   check=True, capture_output=True)
    return {'bytes': path.stat().st_size, 'duration': float(info['format']['duration']),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def load_key():
    key = os.environ.get('ELEVENLABS_API_KEY')
    if not key and (ROOT / '.env').exists():
        for line in (ROOT / '.env').read_text().splitlines():
            name, _, value = line.removeprefix('export ').partition('=')
            if name.strip() == 'ELEVENLABS_API_KEY':
                parts = shlex.split(value, comments=True)
                key = parts[0] if parts else None
    if not key:
        raise SystemExit('ELEVENLABS_API_KEY fehlt in Umgebung oder .env.')
    return key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true', help='API-Aufrufe ausdrücklich ausführen')
    parser.add_argument('--only', help='Nur einen Schlüssel erzeugen, z.B. demo.satz')
    args = parser.parse_args()
    catalog = json.loads((PACK / 'catalog.json').read_text())
    encoding = catalog['encoding']
    clips = catalog['clips']
    if args.only and args.only not in {c['key'] for c in clips}:
        raise SystemExit('Unbekannter Schlüssel.')
    receipts = PACK / '.receipts'
    manifest_path = PACK / 'manifest.json'
    published = {c['key']: c for c in json.loads(manifest_path.read_text())['clips']} if manifest_path.exists() else {}
    approved = {}
    for source_manifest in (ROOT / 'audio/ela').glob('*/manifest.json'):
        if source_manifest == manifest_path:
            continue
        for old in json.loads(source_manifest.read_text())['clips']:
            source = source_manifest.parent / old['file']
            if source.is_file():
                approved[old['fingerprint']] = (source, old)

    def existing(clip):
        path = PACK / clip['file']
        receipt = receipts / (clip['key'] + '.json')
        if path.exists():
            saved = json.loads(receipt.read_text()) if receipt.exists() else published.get(clip['key'], {})
            if saved.get('fingerprint') == clip['fingerprint']:
                try:
                    checked = probe(path, encoding)
                except (ValueError, subprocess.CalledProcessError):
                    return None
                if checked['sha256'] == saved.get('sha256'):
                    return {**clip, **checked}
        return None

    completed = {c['key']: existing(c) for c in clips}
    pending = [c for c in clips if not completed[c['key']] and (not args.only or c['key'] == args.only)]
    print(f'{len(pending)} offen, {sum(len(c["text"]) for c in pending)} Zeichen; '
          f'{encoding["sample_rate"]} Hz / {encoding["channels"]} Kanal / {encoding["bit_rate"] // 1000} kbit/s', flush=True)
    fresh = [c for c in pending if c['fingerprint'] not in approved]
    print(f'Davon {len(pending) - len(fresh)} vorhandene Ela-Aufnahmen; {len(fresh)} neu / {sum(len(c["text"]) for c in fresh)} API-Zeichen.', flush=True)
    if not args.generate:
        print('Vorschau. Zum Erzeugen --generate ergänzen. Maximal zwei gleichzeitige Aufrufe.')
        return
    key = load_key() if pending else None
    receipts.mkdir(exist_ok=True)

    def generate(clip):
        path = PACK / clip['file']
        temp = path.with_suffix('.part.mp3')
        if clip['fingerprint'] in approved:
            source, old = approved[clip['fingerprint']]
            info = probe(source, encoding)
            if info['sha256'] != old['sha256']:
                raise ValueError('Vorhandene Aufnahme beschädigt: ' + str(source))
            temp.write_bytes(source.read_bytes())
            temp.replace(path)
            result = {**clip, **info}
            write_json(receipts / (clip['key'] + '.json'), {**result, 'source': 'approved-ela'})
            print(f'{clip["key"]}: übernommen', flush=True)
            return result
        raw = receipts / (clip['key'] + '.source.mp3')
        reused = False
        source = ROOT / 'audio-samples/cherry-bausteine' / clip['file']
        metadata = source.with_suffix('.json')
        if source.exists() and metadata.exists():
            old = json.loads(metadata.read_text())
            if all(old.get(k) == catalog[k] for k in ('voice_id', 'model_id', 'voice_settings')) and old.get('text') == clip['text']:
                raw.write_bytes(source.read_bytes())
                reused = True
        if not reused:
            payload = {k: catalog[k] for k in ('model_id', 'voice_settings')}
            payload['text'] = clip['text']
            url = f'https://api.elevenlabs.io/v1/text-to-speech/{catalog["voice_id"]}?output_format={catalog["output_format"]}'
            request = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                            headers={'xi-api-key': key, 'Content-Type': 'application/json'})
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(request, timeout=120) as response:
                        if not response.headers.get('Content-Type', '').startswith('audio/'):
                            raise ValueError('API hat keine Audiodatei geliefert.')
                        raw.write_bytes(response.read())
                    break
                except urllib.error.HTTPError as error:
                    if error.code != 429 or attempt == 3:
                        raise RuntimeError(f'API HTTP {error.code} für {clip["key"]}') from None
                    time.sleep(3 * (2 ** attempt))
            # Unklare Netzwerkabbrüche nicht automatisch wiederholen (doppelte Kosten).
        # Die API liefert 44,1 kHz / 128 kbit/s. Für das iPad das gewünschte
        # Zielformat herstellen; hochqualitative API-Datei lokal als Beleg behalten.
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw),
                        '-ac', str(encoding['channels']), '-ar', str(encoding['sample_rate']),
                        '-codec:a', 'libmp3lame', '-b:a', str(encoding['bit_rate']), str(temp)],
                       check=True, capture_output=True)
        info = probe(temp, encoding)
        temp.replace(path)
        result = {**clip, **info}
        write_json(receipts / (clip['key'] + '.json'), {**result, 'source': 'transcoded-approved-sample' if reused else 'elevenlabs'})
        print(f'{clip["key"]}: {info["bytes"]} Bytes' + (' (wiederverwendet)' if reused else ''), flush=True)
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(generate, pending):
            completed[result['key']] = result
    if all(completed.values()):
        manifest = {k: v for k, v in catalog.items() if k != 'clips'}
        manifest['clips'] = list(completed.values())
        manifest['total_bytes'] = sum(c['bytes'] for c in completed.values())
        write_json(PACK / 'manifest.json', manifest)
        print(f'Paket vollständig: {len(clips)} Clips, {manifest["total_bytes"]} Bytes.')
    else:
        print('Teilmenge fertig. Manifest wird erst mit dem vollständigen Paket geschrieben.')


if __name__ == '__main__':
    main()
