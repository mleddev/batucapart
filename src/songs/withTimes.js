/** Ajoute à un morceau la durée d'une mesure, le début/la fin de chaque section et la durée totale. */
export function withTimes(song) {
  const barSeconds = (60 / song.bpm) * song.beatsPerBar;
  const startAt = song.startAt ?? 0; // instant où commence la mesure 1
  let cursor = startAt;
  const sections = song.sections.map((section) => {
    const start = cursor;
    cursor += section.bars * barSeconds;
    return { ...section, start, end: cursor };
  });
  return { ...song, barSeconds, startAt, sections, duration: cursor };
}
