import './style.css';
import { songs } from './songs/index.js';
import { withTimes } from './songs/withTimes.js';
import { loadStems } from './loadStems.js';
import { Player } from './engine/player.js';
import { unlockAudio } from './unlockAudio.js';

const ctx = new AudioContext(); // reste suspendu jusqu'au premier appui sur Lecture

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

document.querySelector('#app').innerHTML = `
  <div class="app">
    <header>
      <h1>${
        songs.length > 1
          ? `<select id="song-select" class="song-select" aria-label="Morceau">
          ${songs.map((s) => `<option value="${s.id}">${s.title}</option>`).join('')}
        </select>`
          : songs[0].title
      }</h1>
    </header>
    <div id="song" class="song-grid"></div>
  </div>
`;

let current = null; // morceau ouvert : { player, togglePlay }
let generation = 0; // sert à ignorer les chargements et boucles d'affichage devenus obsolètes

async function openSong(def) {
  const gen = ++generation;
  if (current) {
    current.player.dispose();
    current = null;
  }
  const root = document.querySelector('#song');
  root.innerHTML = '<p class="hint">Chargement…</p>';
  const song = withTimes(def);
  let stems;
  try {
    stems = await loadStems(ctx, song);
  } catch (error) {
    if (gen !== generation) return;
    root.innerHTML = `<p class="hint">Impossible de charger ce morceau. ${error.message}</p>`;
    return;
  }
  if (gen !== generation) return;
  current = mountSong(root, song, stems, gen);
}

function mountSong(root, song, stems, gen) {
  const player = new Player(ctx, stems, {
    bpm: song.bpm,
    beatsPerBar: song.beatsPerBar,
    beatOffset: song.beatOffset ?? 0,
    // Le métronome clique dès le début des fichiers ; le temps fort tombe sur la mesure 1 (`startAt`).
    barStartBeat: Math.round((song.startAt * song.bpm) / 60),
  });
  const state = {
    section: null, // index de la section choisie
    loop: false,
    seeking: false,
  };

  root.innerHTML = `
    <section class="panel p-transport" aria-label="Lecture">
      <div class="transport">
        <button class="play" id="play" aria-label="Lecture">${playIcon}</button>
        <div class="timeline">
          <input type="range" id="seek" min="0" max="${song.duration.toFixed(3)}" step="0.01" value="0" aria-label="Position" />
          <div class="times"><span id="now">0:00</span><span>${fmt(song.duration)}</span></div>
        </div>
      </div>
    </section>

    <section class="panel p-sections" aria-label="Sections">
      <h2>Sections</h2>
      <div class="map" id="map" aria-hidden="true">
        ${song.sections
          .map((s, i) => `<span class="seg k-${s.kind ?? 'groove'}" data-section="${i}" style="flex:${s.bars} 1 0"></span>`)
          .join('')}
        <div class="playhead" id="playhead"></div>
      </div>
      <ul class="legend" aria-hidden="true">
        <li class="k-groove">Rythme</li><li class="k-montee">Montée</li><li class="k-break">Break</li>
      </ul>
      <ol class="sections" id="strip">
        ${song.sections
          .map(
            (s, i) => `<li><button type="button" data-section="${i}" aria-pressed="false" class="k-${s.kind ?? 'groove'}">
              <span class="text">
                <span class="name">${s.name}</span>
                ${s.detail ? `<span class="detail">${s.detail}</span>` : ''}
              </span>
            </button></li>`,
          )
          .join('')}
      </ol>
      <div class="loop-controls">
        <button type="button" class="toggle" id="loop" aria-pressed="false">Boucler la section</button>
      </div>
      <p class="hint" id="loop-hint">Choisis une section pour la travailler.</p>
    </section>

    <section class="panel p-tempo" aria-label="Tempo">
      <h2>Tempo</h2>
      <div class="tempo-row">
        <input class="slider" type="range" id="tempo" min="40" max="120" step="5" value="100" aria-label="Tempo en pourcentage" />
        <span class="tempo-value" id="tempo-value"></span>
        <button type="button" class="link" id="tempo-reset">100 %</button>
        <button type="button" class="toggle" id="metro" aria-pressed="false">Métronome</button>
      </div>
    </section>

    <section class="panel p-mix" aria-label="Instruments">
      <h2>Instruments</h2>
      <div class="rows" id="rows">
        ${song.instruments
          .map(
            (inst) => `<div class="row" data-id="${inst.id}">
              <span class="label">${inst.label}</span>
              <button type="button" class="chip mute" data-act="mute" aria-pressed="false" aria-label="Couper ${inst.label}">M</button>
              <button type="button" class="chip solo" data-act="solo" aria-pressed="false" aria-label="Solo ${inst.label}">S</button>
              <input class="vol" type="range" min="0" max="100" step="1" value="100" data-act="volume" aria-label="Volume ${inst.label}" />
            </div>`,
          )
          .join('')}
      </div>
      <div class="rows-actions"><button type="button" class="link" id="reset-mix">Tout réinitialiser</button></div>
    </section>

  `;

  const $ = (sel) => root.querySelector(sel);
  const playBtn = $('#play');
  const seek = $('#seek');
  const now = $('#now');
  const strip = $('#strip');
  const playhead = $('#playhead');
  const loopBtn = $('#loop');
  const loopHint = $('#loop-hint');
  const tempo = $('#tempo');
  const tempoValue = $('#tempo-value');
  const metro = $('#metro');

  function sectionAt(seconds) {
    const last = song.sections.length - 1;
    return song.sections.findIndex((s, i) => seconds < s.end || i === last);
  }

  function loopRange() {
    const s = song.sections[state.section];
    return { start: s.start, end: s.end };
  }

  function applyLoop() {
    if (state.loop && state.section !== null) {
      const range = loopRange();
      player.setLoop(range);
      const bars = Number(((range.end - range.start) / song.barSeconds).toFixed(1));
      loopHint.textContent = `Boucle de ${fmt(range.start)} à ${fmt(range.end)} · ${bars} mesures.`;
    } else {
      player.setLoop(null);
      loopHint.textContent =
        state.section === null ? 'Choisis une section pour la travailler.' : 'Active « Boucler la section » pour la répéter.';
    }
  }

  function renderSections() {
    strip.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.section) === state.section));
    });
    root.querySelectorAll('.seg').forEach((seg) => {
      seg.classList.toggle('selected', Number(seg.dataset.section) === state.section);
    });
    loopBtn.setAttribute('aria-pressed', String(state.loop));
  }

  function renderMix() {
    const anySolo = player.solo.size > 0;
    root.querySelectorAll('.row').forEach((row) => {
      const id = row.dataset.id;
      const muted = player.muted.has(id);
      const solo = player.solo.has(id);
      row.querySelector('[data-act="mute"]').setAttribute('aria-pressed', String(muted));
      row.querySelector('[data-act="solo"]').setAttribute('aria-pressed', String(solo));
      row.classList.toggle('silent', anySolo ? !solo : muted);
    });
  }

  function renderTempo() {
    const pct = Number(tempo.value);
    tempoValue.textContent = `${pct} % · ${Math.round((song.bpm * pct) / 100)} BPM`;
  }

  function setPlaying(on) {
    playBtn.innerHTML = on ? pauseIcon : playIcon;
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
  }

  async function togglePlay() {
    unlockAudio(); // iPhone : doit partir d'un geste de l'utilisateur
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      await player.play();
      setPlaying(true);
    }
  }

  playBtn.addEventListener('click', togglePlay);

  seek.addEventListener('input', () => {
    state.seeking = true;
    player.seek(Number(seek.value));
    now.textContent = fmt(Number(seek.value));
  });
  seek.addEventListener('change', () => {
    state.seeking = false;
  });

  // La liste (boutons) et la carte du morceau (segments, souris / doigt seulement) choisissent une section.
  const onSectionClick = (e) => {
    const btn = e.target.closest('[data-section]');
    if (!btn) return;
    state.section = Number(btn.dataset.section);
    applyLoop();
    const start = state.loop ? loopRange().start : song.sections[state.section].start;
    player.seek(start);
    renderSections();
  };
  strip.addEventListener('click', onSectionClick);
  $('#map').addEventListener('click', onSectionClick);

  loopBtn.addEventListener('click', () => {
    if (state.section === null) {
      state.section = Math.max(0, sectionAt(player.position));
    }
    state.loop = !state.loop;
    applyLoop();
    if (state.loop) player.seek(loopRange().start);
    renderSections();
  });

  tempo.addEventListener('input', () => {
    player.setTempo(Number(tempo.value) / 100);
    renderTempo();
  });
  $('#tempo-reset').addEventListener('click', () => {
    tempo.value = '100';
    player.setTempo(1);
    renderTempo();
  });

  metro.addEventListener('click', () => {
    const on = metro.getAttribute('aria-pressed') !== 'true';
    metro.setAttribute('aria-pressed', String(on));
    player.setMetronome(on);
  });

  $('#rows').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.row').dataset.id;
    if (btn.dataset.act === 'mute') player.setMuted(id, !player.muted.has(id));
    else player.setSolo(id, !player.solo.has(id));
    renderMix();
  });

  $('#rows').addEventListener('input', (e) => {
    const slider = e.target.closest('input[data-act="volume"]');
    if (!slider) return;
    player.setVolume(slider.closest('.row').dataset.id, Number(slider.value) / 100);
  });

  $('#reset-mix').addEventListener('click', () => {
    player.muted.clear();
    player.solo.clear();
    player.volumes.clear();
    player._applyGains();
    root.querySelectorAll('input[data-act="volume"]').forEach((s) => {
      s.value = '100';
    });
    renderMix();
  });

  player.onEnded = () => setPlaying(false);

  // Mise à jour de l'affichage à chaque image
  function frame() {
    if (gen !== generation) return;
    const pos = player.position;
    if (!state.seeking) seek.value = pos;
    now.textContent = fmt(pos);
    const span = song.sectionsEnd - song.startAt;
    playhead.style.left = `${Math.min(100, Math.max(0, ((pos - song.startAt) / span) * 100))}%`;
    const currentSection = sectionAt(pos);
    root
      .querySelectorAll('[data-section]')
      .forEach((b) => b.classList.toggle('current', Number(b.dataset.section) === currentSection));
    requestAnimationFrame(frame);
  }

  renderTempo();
  renderMix();
  renderSections();
  frame();

  window.__player = player; // pour les vérifications dans la console du navigateur
  return { player, togglePlay };
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    current?.togglePlay();
  }
});

const select = document.querySelector('#song-select');
select?.addEventListener('change', () => openSong(songs.find((s) => s.id === select.value)));
openSong(songs[0]);
