// iPhone : par défaut le Web Audio est coupé quand le commutateur « silencieux » est activé, et il ne démarre
// qu'après un geste de l'utilisateur. On demande donc à Safari de traiter la page comme un lecteur multimédia
// (comme une appli de musique) et on joue un son vide en boucle, ce qui active la sortie audio.

let unlocked = false;

function silentWavUrl() {
  const rate = 8000;
  const samples = rate / 2; // 0,5 s de silence
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/** À appeler dans le gestionnaire d'un clic ou d'un toucher. */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    /* ignoré */
  }
  try {
    const el = new Audio(silentWavUrl());
    el.loop = true;
    el.setAttribute('playsinline', '');
    el.play().catch(() => {});
  } catch {
    /* ignoré */
  }
}
