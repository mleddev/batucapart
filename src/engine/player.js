import { MixSource } from './mixSource.js';
import { createStretcher } from './stretchFilter.js';

const BLOCK = 4096;

export class Player {
  /**
   * @param {AudioContext} ctx
   * @param {{id: string, data: Float32Array}[]} stems
   * @param {{bpm: number, beatsPerBar: number, beatOffset?: number}} timing
   */
  constructor(ctx, stems, timing) {
    this.ctx = ctx;
    this.sampleRate = ctx.sampleRate;
    this.timing = { beatOffset: 0, ...timing };
    this.source = new MixSource(stems, ctx.sampleRate);
    const { soundtouch, filter } = createStretcher(this.source);
    this.soundtouch = soundtouch;
    this.filter = filter;
    this.tempo = 1;
    this.playing = false;
    this.parkedFrame = 0; // position quand le lecteur est en pause
    this.muted = new Set();
    this.solo = new Set();
    this.volumes = new Map(); // id de piste -> volume (0 à 1), 1 par défaut
    this.metronome = false;
    this.onEnded = null;
    this._buffer = new Float32Array(BLOCK * 2);
    this._click = { remaining: 0, phase: 0, freq: 1500 };
    this._lastBeat = null;
    // Position "virtuelle" du métronome : avance de `tempo` frames par frame de sortie, sans jamais être
    // réestimée, donc parfaitement régulière. Elle est recalée seulement à la lecture, au déplacement et à la boucle.
    this._metroPos = 0;

    this.node = ctx.createScriptProcessor(BLOCK, 2, 2);
    this.node.onaudioprocess = (event) => this._process(event);
    this.node.connect(ctx.destination);
  }

  get duration() {
    return this.source.length / this.sampleRate;
  }

  /** Position réelle dans le morceau (en frames), compensée du préchargement de SoundTouch. */
  _frameNow() {
    if (!this.playing) return this.parkedFrame;
    const virtual = this._virtualNow();
    return this._mapBack(virtual);
  }

  /** Position virtuelle de la prochaine frame qui sera entendue. */
  _virtualNow() {
    const { filter } = this;
    const pendingOut = Math.max(0, filter.outputBuffer.frameCount - filter.outputBufferPosition);
    const lag = filter.inputBuffer.frameCount + pendingOut * this.tempo;
    return Math.max(0, filter.sourcePosition - lag);
  }

  _mapBack(virtual) {
    const { loop } = this.source;
    if (loop && this.filter.sourcePosition >= loop.end && virtual < loop.start) {
      virtual += loop.end - loop.start;
    }
    return Math.min(this.source.map(virtual), this.source.length);
  }

  get position() {
    return this._frameNow() / this.sampleRate;
  }

  async play() {
    if (this.playing) return;
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.parkedFrame >= this.source.length) this.parkedFrame = 0;
    this.filter.sourcePosition = Math.floor(this.parkedFrame);
    this._metroPos = Math.floor(this.parkedFrame);
    this._lastBeat = null;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.parkedFrame = this._frameNow();
    this.playing = false;
  }

  seek(seconds) {
    const frame = Math.max(0, Math.min(Math.floor(seconds * this.sampleRate), this.source.length));
    this.parkedFrame = frame;
    if (this.playing) {
      this.filter.sourcePosition = frame;
      this._metroPos = frame;
    }
    this._lastBeat = null;
  }

  setTempo(value) {
    this.tempo = value;
    this.soundtouch.tempo = value;
  }

  /** @param {{start: number, end: number} | null} loopSeconds */
  setLoop(loopSeconds) {
    if (!loopSeconds) {
      const here = this._frameNow();
      this.source.setLoop(null);
      this._resync(here);
      return;
    }
    const length = this.source.length;
    const start = Math.max(0, Math.floor(loopSeconds.start * this.sampleRate));
    const end = Math.min(length, Math.floor(loopSeconds.end * this.sampleRate));
    if (end - start < this.sampleRate * 0.2) return;
    const here = this._frameNow();
    this.source.setLoop({ start, end });
    // Hors de la zone et après sa fin : on revient au début de la boucle.
    this._resync(here >= end ? start : here);
  }

  _resync(frame) {
    if (this.playing) {
      this.filter.sourcePosition = Math.floor(frame);
      this._metroPos = Math.floor(frame);
    } else {
      this.parkedFrame = frame;
    }
    this._lastBeat = null;
  }

  setMetronome(on) {
    this.metronome = on;
    this._lastBeat = null;
  }

  setMuted(id, on) {
    if (on) this.muted.add(id);
    else this.muted.delete(id);
    this._applyGains();
  }

  setSolo(id, on) {
    if (on) this.solo.add(id);
    else this.solo.delete(id);
    this._applyGains();
  }

  /** @param {number} value entre 0 et 1 (position du curseur) */
  setVolume(id, value) {
    this.volumes.set(id, value);
    this._applyGains();
  }

  _applyGains() {
    const anySolo = this.solo.size > 0;
    this.source.stems.forEach((stem, index) => {
      const audible = anySolo ? this.solo.has(stem.id) : !this.muted.has(stem.id);
      // Courbe au carré : le réglage est plus fin dans les faibles volumes, comme l'oreille l'entend.
      const level = (this.volumes.get(stem.id) ?? 1) ** 2;
      this.source.setStemGain(index, audible ? level : 0);
    });
  }

  _process(event) {
    const left = event.outputBuffer.getChannelData(0);
    const right = event.outputBuffer.getChannelData(1);
    if (!this.playing) {
      left.fill(0);
      right.fill(0);
      return;
    }
    const got = this.filter.extract(this._buffer, BLOCK);
    for (let i = 0; i < got; i++) {
      left[i] = this._buffer[2 * i];
      right[i] = this._buffer[2 * i + 1];
    }
    if (got < BLOCK) {
      for (let i = got; i < BLOCK; i++) {
        left[i] = 0;
        right[i] = 0;
      }
    }
    if (this.metronome && got > 0) this._mixMetronome(left, right, got);
    else this._metroPos += got * this.tempo;
    if (got === 0) {
      this.playing = false;
      this.parkedFrame = 0;
      this.onEnded?.();
    }
  }

  // Le métronome est produit APRÈS l'étirement : les clics gardent leur forme à tous les tempos.
  // Chaque frame de sortie avance de `tempo` frames dans le morceau (compteur `_metroPos`).
  _mixMetronome(left, right, count) {
    const { bpm, beatsPerBar, beatOffset, barStartBeat = 0 } = this.timing;
    const beatFrames = (this.sampleRate * 60) / bpm;
    const offsetFrames = beatOffset * this.sampleRate;
    const click = this._click;
    const clickLength = Math.floor(this.sampleRate * 0.03);
    for (let i = 0; i < count; i++) {
      const songFrame = this.source.map(this._metroPos) - offsetFrames;
      this._metroPos += this.tempo;
      const beat = Math.floor(songFrame / beatFrames);
      // Au tout premier instant (lecture lancée pile sur un temps), on joue aussi le clic de ce temps.
      const onBeatStart = this._lastBeat === null && songFrame >= 0 && songFrame - beat * beatFrames < 2;
      if ((onBeatStart || (this._lastBeat !== null && beat !== this._lastBeat)) && songFrame >= 0) {
        const barBeat = (((beat - barStartBeat) % beatsPerBar) + beatsPerBar) % beatsPerBar;
        click.freq = barBeat === 0 ? 2200 : 1500;
        click.remaining = clickLength;
        click.phase = 0;
      }
      this._lastBeat = beat;
      if (click.remaining > 0) {
        const envelope = click.remaining / clickLength;
        const value = Math.sin(click.phase) * envelope * envelope * 0.5;
        left[i] += value;
        right[i] += value;
        click.phase += (2 * Math.PI * click.freq) / this.sampleRate;
        click.remaining--;
      }
    }
  }

  dispose() {
    this.playing = false;
    this.node.disconnect();
    this.node.onaudioprocess = null;
  }
}
