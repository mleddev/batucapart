// Samba Reggae (batterie Roland TD-17, un instrument par prise).
// Fichiers dans public/songs/samba-reggae/. Tempo 80 BPM vérifié sur l'audio (une attaque tous les 0,75 s).
// Sections : Intro (mesures 1-3), Tourne (mesures 4-7), fin à la mesure 7.

export const sambaReggae = {
  id: 'samba-reggae',
  title: 'Samba Reggae',
  bpm: 80,
  beatsPerBar: 4,
  // Délai de décodage des MP3 par Chrome (~25 ms, mesuré sur ces exports).
  beatOffset: 0.025,
  instruments: [
    { id: 'surdo1', label: 'Surdo 1', file: 'songs/samba-reggae/surdo1.mp3' },
    { id: 'surdo2', label: 'Surdo 2', file: 'songs/samba-reggae/surdo2.mp3' },
    { id: 'surdo3', label: 'Surdo 3', file: 'songs/samba-reggae/surdo3.mp3' },
    { id: 'caixa', label: 'Caisse claire', file: 'songs/samba-reggae/caisseclaire.mp3' },
    { id: 'jay', label: 'Jay', file: 'songs/samba-reggae/jay.mp3' },
  ],
  // La mesure 1 est celle du décompte (4 clics, retirés de l'export) : elle fait partie de l'intro.
  // 7 mesures de 3 s = 21 s : toutes les pistes s'arrêtent à la fin de la mesure 7 (Surdo 3, plus long, est coupé).
  sections: [
    { name: 'Intro', bars: 3 },
    { name: 'Tourne', bars: 4 },
  ],
};
