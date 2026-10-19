/* Gemeinsame Pfade für Webseite und Service Worker; auch unter /Schulkoala/. */
const AUDIO_PACK = Object.freeze({
  base: './audio/ela/full-v1/',
  manifest: './audio/ela/full-v1/manifest.json',
  cache: 'koala-ela-full-v1-' + new URL('./', self.location.href).pathname
});
