/* Gemeinsame Pfade für Webseite und Service Worker; auch unter /Schulkoala/. */
const AUDIO_PACK = Object.freeze({
  base: './audio/cherry/pilot-v1/',
  manifest: './audio/cherry/pilot-v1/manifest.json',
  cache: 'koala-cherry-pilot-v1-' + new URL('./', self.location.href).pathname
});
