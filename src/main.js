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
const restartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h3v16H5zM20 4.5v15L9 12z"/></svg>';
const mixIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>';
const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>';

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
    beatOffset: song.beatOffset ?? 0,
  });
  const state = {
    section: null, // index de la section choisie
    loop: false,
    seeking: false,
    pickedInList: false,
  };

  root.innerHTML = `
    <section class="panel p-transport" aria-label="Lecture">
      <div class="transport">
          <!-- Frise du morceau : un segment par section, largeur proportionnelle à sa durée. On y déplace la lecture. -->
          <div class="map" id="map" role="slider" tabindex="0" aria-label="Position dans le morceau"
            aria-valuemin="0" aria-valuemax="${Math.round(song.sectionsEnd)}" aria-valuenow="0" aria-valuetext="0:00">
            ${song.sections
              .map((s, i) => `<span class="seg k-${s.kind ?? 'groove'}" data-section="${i}" style="flex:${s.bars} 1 0"></span>`)
              .join('')}
            <div class="playhead" id="playhead"></div>
          </div>
          <div class="controls">
            <span class="time" id="now">0:00</span>
            <div class="buttons">
              <button type="button" class="round tempo-btn" id="open-tempo" aria-haspopup="dialog" aria-label="Tempo">
                <span id="tempo-badge">100 %</span>
              </button>
              <button type="button" class="round" id="restart" aria-label="Retour au début">${restartIcon}</button>
              <button type="button" class="play" id="play" aria-label="Lecture">${playIcon}</button>
              <button type="button" class="round mix-btn" id="open-mix" aria-haspopup="dialog" aria-label="Réglages des instruments">
                ${mixIcon}<span class="dot" id="mix-dot" hidden></span>
              </button>
            </div>
            <span class="time end">${fmt(song.duration)}</span>
          </div>
      </div>
    </section>

    <section class="panel p-sections" aria-label="Sections">
      <ol class="sections" id="strip" aria-label="Sections, dans l'ordre du morceau">
        ${song.sections
          .map(
            (s, i) => `<li class="k-${s.kind ?? 'groove'}"><button type="button" data-section="${i}" aria-pressed="false">
              <span class="text">
                <span class="name">${s.name}</span>
                ${s.detail ? `<span class="detail">${s.detail}</span>` : ''}
              </span>
              <span class="loop-tag">Boucle</span>
              <span class="start">${fmt(s.start)}</span>
            </button></li>`,
          )
          .join('')}
      </ol>
      <ul class="legend" aria-hidden="true">
        <li class="k-groove">Rythme</li><li class="k-montee">Montée</li><li class="k-break">Break</li>
      </ul>
      <div class="loop-controls">
        <button type="button" class="toggle" id="loop" aria-pressed="false">Boucler la section</button>
      </div>
      <p class="hint" id="loop-hint">Choisis une section pour la travailler.</p>
    </section>

    <!-- Bottom sheets (fenêtres qui montent du bas de l'écran) -->
    <dialog class="sheet" id="sheet-tempo" aria-labelledby="sheet-tempo-title">
      <div class="sheet-body">
        <div class="sheet-head">
          <h2 id="sheet-tempo-title">Tempo</h2>
          <button type="button" class="round close" data-close aria-label="Fermer">${closeIcon}</button>
        </div>
        <div class="tempo-row">
          <input class="slider" type="range" id="tempo" min="40" max="120" step="5" value="100" aria-label="Tempo en pourcentage" />
          <span class="tempo-value" id="tempo-value"></span>
        </div>
        <div class="tempo-actions">
          <button type="button" class="toggle" id="metro" aria-pressed="false">Métronome</button>
          <button type="button" class="link" id="tempo-reset">Revenir à 100 %</button>
        </div>
      </div>
    </dialog>

    <dialog class="sheet" id="sheet-mix" aria-labelledby="sheet-mix-title">
      <div class="sheet-body">
        <div class="sheet-head">
          <h2 id="sheet-mix-title">Instruments</h2>
          <button type="button" class="round close" data-close aria-label="Fermer">${closeIcon}</button>
        </div>
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
      </div>
    </dialog>
  `;

  const $ = (sel) => root.querySelector(sel);
  const playBtn = $('#play');
  const map = $('#map');
  const now = $('#now');
  const strip = $('#strip');
  const playhead = $('#playhead');
  const loopBtn = $('#loop');
  const loopHint = $('#loop-hint');
  const tempo = $('#tempo');
  const tempoValue = $('#tempo-value');
  const metro = $('#metro');

  // La position revient arrondie à l'échantillon inférieur : au début exact d'une section, elle tombe une
  // fraction de milliseconde avant. La marge évite d'afficher alors la section précédente comme « en cours ».
  const EDGE = 0.02;
  function sectionAt(seconds) {
    const last = song.sections.length - 1;
    return song.sections.findIndex((s, i) => seconds < s.end - EDGE || i === last);
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
    // Seule la section en boucle est signalée (étiquette « Boucle » et contour sur la frise) ;
    // le reste du temps, la section choisie est simplement celle en cours.
    const looped = state.loop ? state.section : null;
    strip.querySelectorAll('li').forEach((li, i) => li.classList.toggle('looping', i === looped));
    root.querySelectorAll('.seg').forEach((seg) => {
      seg.classList.toggle('selected', Number(seg.dataset.section) === looped);
    });
    loopBtn.setAttribute('aria-pressed', String(state.loop));
  }

  // Remplissage du rail des curseurs jusqu'au bouton (Chrome / Safari ; Firefox le fait seul).
  function paintRanges() {
    root.querySelectorAll('input[type="range"]').forEach((input) => {
      const ratio = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      input.style.setProperty('--fill', `${(ratio * 100).toFixed(1)}%`);
    });
  }

  function renderMix() {
    paintRanges();
    const anySolo = player.solo.size > 0;
    // Pastille sur le bouton des réglages quand le mix n'est plus celui d'origine.
    const changed = anySolo || player.muted.size > 0 || [...player.volumes.values()].some((v) => v !== 1);
    $('#mix-dot').hidden = !changed;
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
    paintRanges();
    const pct = Number(tempo.value);
    tempoValue.textContent = `${pct} % · ${Math.round((song.bpm * pct) / 100)} BPM`;
    $('#tempo-badge').textContent = `${pct} %`;
    $('#open-tempo').classList.toggle('changed', pct !== 100);
    $('#open-tempo').setAttribute('aria-label', `Tempo : ${pct} %`);
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

  /** Déplace la lecture. Sortir de la section en boucle arrête la boucle. */
  function seekTo(seconds) {
    const target = Math.min(Math.max(seconds, 0), song.sectionsEnd);
    if (state.loop) {
      const range = loopRange();
      if (target < range.start || target >= range.end) {
        state.loop = false;
        applyLoop();
        renderSections();
      }
    }
    player.seek(target);
  }

  $('#restart').addEventListener('click', () => {
    seekTo(state.loop ? loopRange().start : song.startAt);
  });

  // Frise : cliquer ou glisser (souris ou doigt) pour se déplacer ; flèches du clavier : ±1 mesure.
  const timeAtX = (clientX) => {
    const box = map.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return song.startAt + ratio * (song.sectionsEnd - song.startAt);
  };
  map.addEventListener('pointerdown', (e) => {
    map.setPointerCapture(e.pointerId);
    state.seeking = true;
    seekTo(timeAtX(e.clientX));
  });
  map.addEventListener('pointermove', (e) => {
    if (state.seeking) seekTo(timeAtX(e.clientX));
  });
  const endDrag = () => {
    state.seeking = false;
  };
  map.addEventListener('pointerup', endDrag);
  map.addEventListener('pointercancel', endDrag);
  map.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (e.key === 'Home') seekTo(song.startAt);
    else if (e.key === 'End') seekTo(song.sectionsEnd);
    else if (step) seekTo(player.position + step * song.barSeconds);
    else return;
    e.preventDefault();
  });

  // Un clic dans la liste choisit une section.
  const onSectionClick = (e) => {
    const btn = e.target.closest('[data-section]');
    if (!btn) return;
    state.section = Number(btn.dataset.section);
    // La ligne cliquée est déjà sous les yeux : pas de défilement quand elle devient la section en cours.
    state.pickedInList = state.section !== lastSection;
    applyLoop();
    const start = state.loop ? loopRange().start : song.sections[state.section].start;
    player.seek(start);
    renderSections();
  };
  strip.addEventListener('click', onSectionClick);

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
    renderMix();
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

  // Bottom sheets : ouverture par les boutons du lecteur ; fermeture par ×, Échap ou un appui à côté.
  const openSheet = (id) => $(id).showModal();
  $('#open-tempo').addEventListener('click', () => openSheet('#sheet-tempo'));
  $('#open-mix').addEventListener('click', () => openSheet('#sheet-mix'));
  root.querySelectorAll('dialog.sheet').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    });
  });

  player.onEnded = () => setPlaying(false);

  // Mise à jour de l'affichage à chaque image
  let lastSection = null;
  function frame() {
    if (gen !== generation) return;
    const pos = player.position;
    now.textContent = fmt(pos);
    map.setAttribute('aria-valuenow', String(Math.round(pos)));
    map.setAttribute('aria-valuetext', fmt(pos));
    const span = song.sectionsEnd - song.startAt;
    playhead.style.left = `${Math.min(100, Math.max(0, ((pos - song.startAt) / span) * 100))}%`;
    const currentSection = sectionAt(pos);
    root
      .querySelectorAll('[data-section]')
      .forEach((b) => b.classList.toggle('current', Number(b.dataset.section) === currentSection));
    // La page suit la section en cours (lecture, frise, clavier), sauf si on vient de la choisir dans la liste.
    if (currentSection !== lastSection) {
      if (lastSection !== null && !state.pickedInList) {
        strip.querySelector(`[data-section="${currentSection}"]`)?.scrollIntoView({
          block: 'center',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }
      lastSection = currentSection;
      state.pickedInList = false;
    }
    // Sans boucle, la section choisie se désélectionne dès que la lecture en sort.
    if (!state.loop && state.section !== null) {
      const chosen = song.sections[state.section];
      if (pos >= chosen.end - EDGE || pos < chosen.start - 0.05) {
        state.section = null;
        renderSections();
        applyLoop();
      }
    }
    // Avancement dans la section en cours : remplit le fond de sa ligne de gauche à droite.
    const cur = song.sections[currentSection];
    const progress = Math.min(1, Math.max(0, (pos - cur.start) / (cur.end - cur.start)));
    strip.style.setProperty('--progress', `${(progress * 100).toFixed(2)}%`);
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
