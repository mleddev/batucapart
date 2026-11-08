// Vérifie le moteur sans navigateur :
//  1. ralentir à 50 % double la durée sans changer la hauteur (sinus 440 Hz)
//  2. la boucle de section revient bien au point de départ
//  3. mute / solo : une piste coupée disparaît du mix
// Usage : node scripts/check-stretch.mjs
import { MixSource } from '../src/engine/mixSource.js';
import { createStretcher } from '../src/engine/stretchFilter.js';

const SR = 44100;
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} — ${detail}`);
  if (!ok) failures++;
};

function render(source, tempo, seconds, setup) {
  const { soundtouch, filter } = createStretcher(source);
  soundtouch.tempo = tempo;
  setup?.(filter);
  const frames = Math.floor(seconds * SR);
  const out = new Float32Array(frames);
  const block = new Float32Array(4096 * 2);
  let written = 0;
  while (written < frames) {
    const got = filter.extract(block, Math.min(4096, frames - written));
    if (got === 0) break;
    for (let i = 0; i < got; i++) out[written + i] = block[2 * i];
    written += got;
  }
  return { out: out.subarray(0, written), filter };
}

// Fréquence estimée par passages à zéro (montants) sur la zone centrale.
function frequency(signal) {
  const from = Math.floor(signal.length * 0.25);
  const to = Math.floor(signal.length * 0.75);
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (signal[i - 1] < 0 && signal[i] >= 0) crossings++;
  return crossings / ((to - from) / SR);
}

// 1. Tempo
{
  const lengthSec = 20;
  const sine = new Float32Array(lengthSec * SR);
  for (let i = 0; i < sine.length; i++) sine[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
  for (const tempo of [1, 0.75, 0.5]) {
    const source = new MixSource([{ id: 'sine', data: sine }], SR, 1);
    const playSec = 6; // durée de sortie
    const { out, filter } = render(source, tempo, playSec);
    const f = frequency(out);
    const consumed = filter.sourcePosition / SR;
    const expected = playSec * tempo;
    check(
      `tempo ${tempo}: hauteur conservée`,
      Math.abs(f - 440) < 6,
      `${f.toFixed(1)} Hz (attendu 440)`,
    );
    check(
      `tempo ${tempo}: avance dans le morceau`,
      Math.abs(consumed - 0.19 - expected) < 0.6,
      `${consumed.toFixed(2)} s de source lues pour ${playSec} s de sortie (≈ ${expected.toFixed(2)} s + préchargement)`,
    );
  }
}

// 2. Boucle : une rampe dont la valeur vaut position / longueur
{
  const total = 10 * SR;
  const ramp = new Float32Array(total);
  for (let i = 0; i < total; i++) ramp[i] = i / total;
  const source = new MixSource([{ id: 'ramp', data: ramp }], SR, 1);
  const loop = { start: 2 * SR, end: 3 * SR };
  source.setLoop(loop);
  const { out } = render(source, 1, 6, (filter) => {
    filter.sourcePosition = loop.start - Math.floor(0.5 * SR);
  });
  const lo = (loop.start / total) - 1e-3;
  const hi = (loop.end / total) + 1e-3;
  const afterStart = out.subarray(Math.floor(0.6 * SR)); // on ignore les 0,5 s avant la boucle
  const inside = afterStart.every((v) => v >= lo && v <= hi);
  let wraps = 0;
  for (let i = 1; i < afterStart.length; i++) if (afterStart[i] < afterStart[i - 1] - 0.05) wraps++;
  check('boucle: reste dans [2 s ; 3 s]', inside, `min ${afterStart.reduce((m, v) => Math.min(m, v), 1).toFixed(3)}, max ${afterStart.reduce((m, v) => Math.max(m, v), 0).toFixed(3)}`);
  check('boucle: revient au début', wraps >= 4, `${wraps} retours en ~5,4 s (attendu 5)`);
}

// 3. Mute et solo
{
  const a = new Float32Array(2 * SR).fill(0.5);
  const b = new Float32Array(2 * SR).fill(0.25);
  const level = (muteA, muteB) => {
    const source = new MixSource([{ id: 'a', data: a }, { id: 'b', data: b }], SR, 1);
    source.gains = [muteA ? 0 : 1, muteB ? 0 : 1];
    source.targets = [...source.gains];
    const { out } = render(source, 1, 1);
    return out[Math.floor(out.length / 2)];
  };
  check('mix: a + b', Math.abs(level(false, false) - 0.75) < 0.01, level(false, false).toFixed(3));
  check('mute a', Math.abs(level(true, false) - 0.25) < 0.01, level(true, false).toFixed(3));
  check('mute a et b', Math.abs(level(true, true)) < 0.01, level(true, true).toFixed(3));
}

console.log(failures === 0 ? '\nTout est bon.' : `\n${failures} vérification(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
