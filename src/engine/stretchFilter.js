import { SimpleFilter, SoundTouch } from 'soundtouchjs';

// SimpleFilter de SoundTouch précharge 16384 frames (~0,37 s) avant de produire du son,
// ce qui retarderait d'autant les mute/solo. On réduit ce préchargement à 8192 frames.
const INPUT_TARGET = 8192;

export class LowLatencyFilter extends SimpleFilter {
  fillOutputBuffer(numFrames = 0) {
    while (this.outputBuffer.frameCount < numFrames) {
      const wanted = INPUT_TARGET - this.inputBuffer.frameCount;
      if (wanted > 0) this.fillInputBuffer(wanted);
      if (this.inputBuffer.frameCount < INPUT_TARGET) break;
      this._pipe.process();
    }
  }
}

export function createStretcher(source) {
  const soundtouch = new SoundTouch();
  soundtouch.tempo = 1;
  soundtouch.pitch = 1;
  const filter = new LowLatencyFilter(source, soundtouch);
  return { soundtouch, filter };
}
