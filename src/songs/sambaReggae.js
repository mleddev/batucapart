// Samba Reggae (GarageBand, un instrument par piste).
// Fichiers dans public/songs/samba-reggae/. Tempo 88 BPM vérifié sur l'audio (surdo grave : une frappe tous les 0,682 s).
// Mesure 1 = début des fichiers. Le morceau va de la mesure 1 à la mesure 54 (53 mesures, 2:25),
// suivi d'un peu de résonance (`tail`).

export const sambaReggae = {
  id: 'samba-reggae',
  title: 'Samba Reggae',
  bpm: 88,
  beatsPerBar: 4,
  // Délai de décodage des MP3 par Chrome (~25 ms, mesuré sur les exports GarageBand).
  beatOffset: 0.025,
  // Résonance après le « Hey ! » final : couvre toute la longueur des exports (surdos : 147,1 s).
  tail: 2.6,
  instruments: [
    { id: 'surdo-low', label: 'Surdo grave', file: 'songs/samba-reggae/surdo-low.mp3' },
    { id: 'surdo-med', label: 'Surdo médium', file: 'songs/samba-reggae/surdo-med.mp3' },
    { id: 'surdo-high', label: 'Surdo aigu', file: 'songs/samba-reggae/surdo-high.mp3' },
    { id: 'caixa', label: 'Caisse claire', file: 'songs/samba-reggae/caisse-claire.mp3' },
    { id: 'repinique', label: 'Repinique', file: 'songs/samba-reggae/repinique.mp3' },
    { id: 'timbao', label: 'Timbao', file: 'songs/samba-reggae/timbao.mp3' },
    { id: 'jay', label: 'Jay', file: 'songs/samba-reggae/jay.mp3' },
  ],
  // `bars` peut être fractionnaire (demi-mesure). Entre parenthèses : les mesures d'origine.
  // `kind` donne la couleur : groove (rythme qui tourne), montee, break.
  sections: [
    { name: 'Intro', bars: 3, kind: 'montee' }, // 1-3
    { name: 'Tourne', bars: 4, kind: 'groove' }, // 4-7
    { name: 'Phrases des timbaos', detail: 'Les timbaos font des phrases, les autres continuent', bars: 8, kind: 'groove' }, // 8-15
    { name: 'Montée des surdos', detail: 'Les timbaos ont fini, les surdos font monter vers le break', bars: 3, kind: 'montee' }, // 16-18
    { name: 'Break 1', bars: 1, kind: 'break' }, // 19
    { name: 'Tourne', bars: 5, kind: 'groove' }, // 20-24
    { name: 'Repiniques et timbaos seuls', detail: 'Les surdos et la caisse claire s’arrêtent', bars: 4, kind: 'groove' }, // 25-28
    { name: 'Montée', detail: 'Tous ensemble', bars: 1, kind: 'montee' }, // 29
    { name: 'Retour de tous', detail: 'Surdos et caisse claire rentrent avec les phrases repiniques / timbaos', bars: 4, kind: 'groove' }, // 30-33
    { name: 'Questions / réponses', bars: 2, kind: 'break' }, // 34-35
    { name: 'Autre rythme', detail: 'Nom à trouver', bars: 4, kind: 'groove' }, // 36-39
    { name: 'Bon chance', detail: 'Méli-mélo', bars: 9, kind: 'groove' }, // 40-48
    { name: 'Hey ! avec relance', bars: 1.5, kind: 'break' }, // 49-50,5
    { name: 'Bon chance', detail: 'Méli-mélo', bars: 3, kind: 'groove' }, // 50,5-53,5
    { name: 'Hey ! final', detail: 'Sans relance', bars: 0.5, kind: 'break' }, // 53,5-54
  ],
};
