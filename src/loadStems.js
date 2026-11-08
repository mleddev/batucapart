// Charge les fichiers audio d'un morceau et les met tous à la même longueur.
// Les exports de GarageBand s'arrêtent à la dernière note, donc les durées diffèrent :
// on complète par du silence (ou on coupe) pour que toutes les pistes durent exactement `song.duration`.

/**
 * @param {AudioContext} ctx
 * @param {{duration: number, instruments: {id: string, label: string, file: string}[]}} song
 */
export async function loadStems(ctx, song) {
  const frames = Math.round(song.duration * ctx.sampleRate);
  return Promise.all(
    song.instruments.map(async (inst) => {
      const url = new URL(inst.file, document.baseURI).href;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fichier introuvable : ${inst.file} (${response.status})`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());

      // Mono : moyenne des canaux.
      const data = new Float32Array(frames);
      const used = Math.min(frames, buffer.length);
      const channels = buffer.numberOfChannels;
      for (let c = 0; c < channels; c++) {
        const source = buffer.getChannelData(c);
        for (let i = 0; i < used; i++) data[i] += source[i] / channels;
      }

      const extra = (buffer.length - frames) / ctx.sampleRate;
      if (extra > 0.05) {
        console.warn(`${inst.file} dépasse la durée du morceau de ${extra.toFixed(2)} s : la fin est coupée.`);
      }
      return { id: inst.id, label: inst.label, data };
    }),
  );
}
