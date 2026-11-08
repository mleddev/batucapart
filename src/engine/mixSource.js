// Source audio lue par SoundTouch : mixe toutes les pistes AVANT l'étirement du tempo.
// Un seul étirement pour tout le mix garantit que les pistes restent synchronisées
// (étirer chaque piste séparément les décalerait légèrement l'une par rapport à l'autre).

const RAMP_SECONDS = 0.01; // fondu de 10 ms pour éviter les clics au mute/solo

export class MixSource {
  /**
   * @param {{id: string, data: Float32Array}[]} stems pistes mono, au sampleRate du contexte audio
   * @param {number} sampleRate
   */
  constructor(stems, sampleRate, masterGain = 0.6) {
    this.stems = stems;
    this.sampleRate = sampleRate;
    this.masterGain = masterGain;
    this.length = stems.reduce((max, s) => Math.max(max, s.data.length), 0);
    this.targets = stems.map(() => 1);
    this.gains = stems.map(() => 1);
    this.loop = null; // { start, end } en frames
    this.rampStep = 1 / (sampleRate * RAMP_SECONDS);
  }

  setStemGain(index, value) {
    this.targets[index] = value;
  }

  setLoop(loop) {
    this.loop = loop;
  }

  /** Position "virtuelle" (qui continue de croître pendant une boucle) -> position réelle dans le morceau. */
  map(position) {
    const loop = this.loop;
    if (!loop || position < loop.start) return position;
    return loop.start + ((position - loop.start) % (loop.end - loop.start));
  }

  // Interface attendue par SimpleFilter : remplit `target` (stéréo entrelacé), renvoie le nombre de frames.
  extract(target, numFrames, position) {
    const { stems, gains, targets, rampStep, masterGain, length } = this;
    const count = stems.length;
    let produced = 0;
    for (let i = 0; i < numFrames; i++) {
      const p = this.map(position + i);
      if (p >= length) break;
      let sample = 0;
      for (let k = 0; k < count; k++) {
        let g = gains[k];
        const t = targets[k];
        if (g !== t) {
          g += g < t ? Math.min(rampStep, t - g) : -Math.min(rampStep, g - t);
          gains[k] = g;
        }
        if (g !== 0) {
          const data = stems[k].data;
          if (p < data.length) sample += data[p] * g;
        }
      }
      sample *= masterGain;
      target[2 * i] = sample;
      target[2 * i + 1] = sample;
      produced++;
    }
    return produced;
  }
}
