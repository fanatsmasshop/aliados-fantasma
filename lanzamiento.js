import {
  getLaunchState,
  clearLaunchStateCache,
  formatLaunchDate,
  isAdministrator
} from './launch-control.js?v=20260730-CINEMA2';
import { activateLiveHome, deactivateLiveHome } from './home-live.js?v=20260730-LIVE1';

const pad = value => String(Math.max(0, value)).padStart(2, '0');
const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const PRESENTATION_DURATION = { evento: 28000, breve: 8000 };
const OPEN_TRANSITION_MS = 1100;

const isShortMobileDevice = () =>
  window.matchMedia('(max-width: 760px)').matches ||
  window.matchMedia('(pointer: coarse)').matches;


let launchMusic = null;
let launchAudioUnlocked = false;
let launchSoundStarting = false;

const launchTracks = {
  evento: 'af-lanzamiento-28s.mp3?v=20260731-MUSIC1',
  breve: 'af-lanzamiento-8s.mp3?v=20260731-MUSIC1'
};

function getLaunchMusic(mode = 'breve') {
  const src = launchTracks[mode] || launchTracks.breve;
  if (!launchMusic) {
    launchMusic = new Audio();
    launchMusic.preload = 'auto';
    launchMusic.playsInline = true;
    launchMusic.volume = .88;
  }

  if (launchMusic.dataset.mode !== mode) {
    try { launchMusic.pause(); } catch {}
    launchMusic.src = src;
    launchMusic.dataset.mode = mode;
    launchMusic.currentTime = 0;
    launchMusic.load();
  }

  return launchMusic;
}

function stopLaunchAudio() {
  if (!launchMusic) return;
  try {
    launchMusic.pause();
    launchMusic.currentTime = 0;
  } catch {}
  launchMusic = null;
}

async function activateLaunchSound(overlay, mode, startedAt, duration) {
  if (launchSoundStarting) return false;
  launchSoundStarting = true;

  try {
    const audio = getLaunchMusic(mode);
    audio.muted = false;
    audio.volume = .88;

    const elapsedSeconds = Math.min(
      Math.max(0, (duration - 80) / 1000),
      Math.max(0, (performance.now() - startedAt) / 1000)
    );

    const seekToElapsed = () => {
      try {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.min(elapsedSeconds, Math.max(0, audio.duration - .08));
        }
      } catch {}
    };

    if (audio.readyState >= 1) seekToElapsed();
    else audio.addEventListener('loadedmetadata', seekToElapsed, { once: true });

    // Debe ejecutarse dentro de la misma interacción del usuario en escritorio.
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') await playPromise;

    launchAudioUnlocked = true;
    overlay?.classList.add('sound-active');
    const prompt = document.getElementById('launch-sound-prompt');
    if (prompt) {
      prompt.setAttribute('aria-hidden', 'true');
      prompt.tabIndex = -1;
    }
    return true;
  } catch (error) {
    launchAudioUnlocked = false;
    overlay?.classList.remove('sound-active');
    const prompt = document.getElementById('launch-sound-prompt');
    if (prompt) {
      prompt.hidden = false;
      prompt.setAttribute('aria-hidden', 'false');
      prompt.tabIndex = 0;
    }
    console.warn('Aliados Fantasma: el navegador bloqueó el audio.', error);
    return false;
  } finally {
    launchSoundStarting = false;
  }
}

// El audio se activa desde el control visible de la presentación.
// Evitamos el desbloqueo silencioso porque algunos navegadores de escritorio
// no conservan ese permiso cuando la pista cambia después.

let launchState = null;
let launchRefreshInProgress = false;
let revealInProgress = false;
let forcedPresentationConsumed = false;
let lastZeroRefreshAt = 0;

function setCountdownValues(values) {
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  const bottomDays = document.getElementById('days-bottom');
  const bottomHours = document.getElementById('hours-bottom');
  if (bottomDays) bottomDays.textContent = values.days;
  if (bottomHours) bottomHours.textContent = values.hours;
}

function getRevealRequest() {
  const params = new URLSearchParams(window.location.search);
  const requested = String(params.get('reveal') || params.get('presentacion') || '').toLowerCase();
  const mode = requested === 'event' || requested === 'evento' || requested === '1'
    ? 'evento'
    : requested === 'short' || requested === 'breve'
      ? 'breve'
      : null;
  return {
    mode,
    preview: params.get('preview') === '1' || params.get('admin_preview') === '1'
  };
}

function getRevealStorageKey(state) {
  const version = Number(state.presentationVersion || 1);
  return `af-launch-presentation:${version}:${state.presentationMode || 'breve'}`;
}

function wasRevealSeen(state) {
  try {
    return window.localStorage.getItem(getRevealStorageKey(state)) === '1';
  } catch {
    return false;
  }
}

function markRevealSeen(state) {
  try {
    window.localStorage.setItem(getRevealStorageKey(state), '1');
  } catch {
    // El modo privado puede impedir localStorage. La presentación seguirá funcionando.
  }
}

function shouldRunConfiguredReveal(state, { initial, transitionedToOpen }) {
  if (!state.open || state.presentationMode === 'ninguna') return null;

  if (state.presentationFrequency === 'solo_lanzamiento') {
    return transitionedToOpen ? state.presentationMode : null;
  }

  if (state.presentationFrequency === 'cada_entrada') {
    return initial || transitionedToOpen ? state.presentationMode : null;
  }

  return (initial || transitionedToOpen) && !wasRevealSeen(state)
    ? state.presentationMode
    : null;
}

function createRevealBusinessPreview() {
  const container = document.getElementById('launch-reveal-businesses');
  const message = document.getElementById('launch-reveal-message');
  if (!container) return;

  const cards = [...document.querySelectorAll('#live-featured-grid .live-business-card')].slice(0, 4);
  const totalText = document.getElementById('live-business-count')?.textContent?.trim();
  const total = Number.parseInt(totalText || '0', 10);

  container.replaceChildren();
  cards.forEach(card => {
    const image = card.querySelector('.live-card-logo');
    const heading = card.querySelector('h3');
    if (!image || !heading) return;

    const item = document.createElement('span');
    item.className = 'launch-reveal__business';

    const clone = document.createElement('img');
    clone.src = image.currentSrc || image.src;
    clone.alt = '';

    const name = document.createElement('small');
    name.textContent = heading.textContent?.trim() || 'Negocio aliado';

    item.append(clone, name);
    container.append(item);
  });

  if (message && Number.isFinite(total) && total > 0) {
    message.textContent = `${total} negocio${total === 1 ? '' : 's'} ya ${total === 1 ? 'forma' : 'forman'} parte de la red.`;
  }
}

function setRevealScene(overlay, sceneName) {
  overlay.querySelectorAll('.launch-scene').forEach(scene => {
    const active = scene.dataset.scene === sceneName;
    scene.classList.remove('is-leaving');
    scene.classList.toggle('is-active', active);
    scene.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  [...overlay.classList]
    .filter(name => name.startsWith('scene-'))
    .forEach(name => overlay.classList.remove(name));
  overlay.classList.add(`scene-${sceneName}`);
}

const VERSION_STAGES = {
  idea: { scene:'intro', version:'v0.1', state:'INICIANDO', eyebrow:'PRIMERA ETAPA', title:'La idea', copy:'Todo comenzó con una visión: conectar y apoyar negocios locales.', visual:'spark' },
  register: { scene:'story', version:'v0.3', state:'CONSTRUYENDO', eyebrow:'EVOLUCIÓN DEL PROYECTO', title:'Primer registro', copy:'La idea comenzó a convertirse en una plataforma real.', visual:'form' },
  profiles: { scene:'connection', version:'v0.7', state:'ACTUALIZANDO', eyebrow:'NUEVA FUNCIÓN', title:'Perfiles de negocio', copy:'Cada comercio empezó a tener identidad y presencia propia.', visual:'profiles' },
  directory: { scene:'identity', version:'v1.2', state:'CONECTANDO', eyebrow:'LA RED TOMA FORMA', title:'Directorio local', copy:'Los negocios comenzaron a reunirse dentro de una misma red.', visual:'directory' },
  dashboard: { scene:'promise', version:'v2.0', state:'AMPLIANDO', eyebrow:'MÁS HERRAMIENTAS', title:'Panel de comerciantes', copy:'Más control, más herramientas y nuevas posibilidades.', visual:'dashboard' },
  visibility: { scene:'story', version:'v2.4', state:'PUBLICANDO', eyebrow:'LA RED SE HACE VISIBLE', title:'Visibilidad local', copy:'Los perfiles comenzaron a ser visibles para toda la comunidad.', visual:'visibility' },
  marketing: { scene:'count', version:'v2.8', state:'IMPULSANDO', eyebrow:'ACTUALIZACIÓN TRAS ACTUALIZACIÓN', title:'Marketing y crecimiento', copy:'Más presencia, más alcance y recursos para crecer.', visual:'marketing' },
  ready: { scene:'connection', version:'v3.0', state:'LISTA', eyebrow:'VERSIÓN FINAL', title:'Red preparada', copy:'La plataforma quedó conectada y preparada para su lanzamiento.', visual:'ready' }
};

function renderVersionStage(overlay, stage) {
  if (!overlay || !stage) return;
  const scene = overlay.querySelector(`[data-scene="${stage.scene}"]`);
  if (!scene) return;

  scene.className = `launch-scene launch-scene--version version-visual--${stage.visual}`;
  scene.dataset.scene = stage.scene;
  scene.querySelector('.version-stage__number')?.replaceChildren(document.createTextNode(stage.version));
  scene.querySelector('.version-stage__state')?.replaceChildren(document.createTextNode(stage.state));
  scene.querySelector('.version-stage__eyebrow')?.replaceChildren(document.createTextNode(stage.eyebrow));
  const titleElement = scene.querySelector('.version-stage__title');
  titleElement?.replaceChildren(document.createTextNode(stage.title));
  scene.querySelector('.version-stage__copy')?.replaceChildren(document.createTextNode(stage.copy));
  scene.classList.toggle('title-long', stage.title.length >= 20);
  scene.classList.toggle('title-very-long', stage.title.length >= 24);

  scene.classList.remove('version-hit');
  void scene.offsetWidth;
  scene.classList.add('version-hit');
  setRevealScene(overlay, stage.scene);
}

function startRevealProgress(duration) {
  const bar = document.getElementById('launch-reveal-progress-bar');
  const timeLabel = document.getElementById('launch-reveal-time');
  const startedAt = performance.now();

  const update = () => {
    const elapsed = performance.now() - startedAt;
    const progress = Math.min(1, elapsed / duration);
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (timeLabel) {
      const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
      timeLabel.textContent = `00:${String(remaining).padStart(2, '0')}`;
    }
    return progress;
  };

  update();
  const timer = window.setInterval(() => {
    if (update() >= 1) window.clearInterval(timer);
  }, 100);

  return () => {
    window.clearInterval(timer);
    if (bar) bar.style.transform = 'scaleX(1)';
    if (timeLabel) timeLabel.textContent = '00:00';
  };
}

async function runVersionSequence(overlay, pause, steps) {
  for (const [stage, hold] of steps) {
    renderVersionStage(overlay, stage);
    if (!await pause(hold)) return false;
  }
  return true;
}

function ensureShortHistoryScene(overlay) {
  let scene = overlay.querySelector('[data-scene="short-history"]');
  if (scene) return scene;

  scene = document.createElement('section');
  scene.className = 'launch-scene launch-scene--short-history';
  scene.dataset.scene = 'short-history';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = `
    <div class="short-evolution">
      <div class="short-evolution__head">
        <span>ALIADOS FANTASMA</span>
        <strong>SECUENCIA DE LANZAMIENTO</strong>
      </div>
      <div class="short-evolution__stage" aria-label="Evolución resumida de Aliados Fantasma">
        <div class="short-evolution__core">
          <span class="short-evolution__halo"></span>
          <img src="aliados-fantasma-icono.webp" alt="">
          <b>RED</b>
        </div>
        <span class="short-node short-node--idea" data-short-step="0"><i></i><b>v0.1</b><em>IDEA</em></span>
        <span class="short-node short-node--profiles" data-short-step="1"><i></i><b>v0.7</b><em>PERFILES</em></span>
        <span class="short-node short-node--directory" data-short-step="2"><i></i><b>v1.2</b><em>DIRECTORIO</em></span>
        <span class="short-node short-node--panel" data-short-step="3"><i></i><b>v2.0</b><em>PANEL</em></span>
        <span class="short-node short-node--marketing" data-short-step="4"><i></i><b>v2.8</b><em>MARKETING</em></span>
        <span class="short-node short-node--ready" data-short-step="5"><i></i><b>v3.0</b><em>LISTA</em></span>
        <div class="short-evolution__beam" aria-hidden="true"></div>
      </div>
      <div class="short-evolution__foot">
        <p class="short-history__status">INICIANDO LA IDEA</p>
        <div class="short-history__bar"><i></i></div>
      </div>
    </div>`;
  overlay.querySelector('.launch-reveal__timeline')?.appendChild(scene);
  return scene;
}

function updateShortHistory(scene, index) {
  const labels = [
    'UNA IDEA EMPIEZA A TOMAR FORMA',
    'CADA NEGOCIO OBTIENE IDENTIDAD',
    'LOS NEGOCIOS SE ENCUENTRAN',
    'NACEN NUEVAS HERRAMIENTAS',
    'LA RED EMPIEZA A CRECER',
    'ALIADOS FANTASMA ESTÁ LISTO'
  ];
  scene.dataset.activeStep = String(index);
  scene.querySelectorAll('[data-short-step]').forEach((item, itemIndex) => {
    item.classList.toggle('is-done', itemIndex < index);
    item.classList.toggle('is-current', itemIndex === index);
  });
  const core = scene.querySelector('.short-evolution__core');
  if (core) core.dataset.level = String(index + 1);
  const status = scene.querySelector('.short-history__status');
  if (status) status.textContent = labels[index] || labels[labels.length - 1];
  const bar = scene.querySelector('.short-history__bar i');
  if (bar) bar.style.transform = `scaleX(${Math.min(1, (index + 1) / 6)})`;
}

async function runEventTimeline(overlay, pause) {
  const completed = await runVersionSequence(overlay, pause, [
    [VERSION_STAGES.idea, 3000],
    [VERSION_STAGES.register, 3000],
    [VERSION_STAGES.profiles, 3000],
    [VERSION_STAGES.directory, 3000],
    [VERSION_STAGES.dashboard, 3000],
    [VERSION_STAGES.visibility, 3000],
    [VERSION_STAGES.marketing, 3000],
    [VERSION_STAGES.ready, 3000]
  ]);
  if (!completed) return;
  setRevealScene(overlay, 'final');
  await pause(4000);
}

async function runShortTimeline(overlay, pause) {
  const scene = ensureShortHistoryScene(overlay);
  setRevealScene(overlay, 'short-history');

  const holds = [760, 720, 720, 720, 720, 1050];
  for (let index = 0; index < holds.length; index += 1) {
    updateShortHistory(scene, index);
    scene.classList.remove('short-hit');
    void scene.offsetWidth;
    scene.classList.add('short-hit');
    if (!await pause(holds[index])) return;
  }

  setRevealScene(overlay, 'final');
  await pause(2310);
}

async function runLaunchReveal(mode, state) {
  if (revealInProgress) return;

  const overlay = document.getElementById('launch-reveal');
  const skipButton = document.getElementById('launch-reveal-skip');
  if (!overlay) {
    document.body.classList.add('launch-reveal-complete');
    await activateLiveHome();
    return;
  }

  revealInProgress = true;
  let skipped = false;
  let skipResolve;
  const skipPromise = new Promise(resolve => { skipResolve = resolve; });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reducedMotion ? 1800 : PRESENTATION_DURATION[mode] || PRESENTATION_DURATION.breve;
  const soundPrompt = document.getElementById('launch-sound-prompt');
  const revealStartedAt = performance.now();
  const modeLabel = document.getElementById('launch-reveal-mode-label');
  if (modeLabel) modeLabel.textContent = mode === 'evento' ? 'HISTORIAL DE VERSIONES · 28 S' : 'HISTORIAL DE VERSIONES · 8 S';

  const requestSkip = () => {
    if (skipped) return;
    skipped = true;
    skipResolve();
  };
  const pause = async milliseconds => {
    await Promise.race([wait(milliseconds), skipPromise]);
    return !skipped;
  };
  const onKeydown = event => {
    if (event.key === 'Escape') requestSkip();
  };

  skipButton?.addEventListener('click', requestSkip, { once: true });
  document.addEventListener('keydown', onKeydown);

  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  document.body.classList.remove('launch-reveal-complete');
  document.body.classList.add('launch-reveal-active', 'live-preparing');
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.className = `launch-reveal mode-${mode === 'evento' ? 'event' : 'short'}`;
  const shortMobile = mode === 'breve' && isShortMobileDevice();
  overlay.classList.toggle('mobile-lite', shortMobile);
  void overlay.offsetWidth;
  overlay.classList.add('is-running');
  overlay.classList.remove('sound-active');
  if (soundPrompt) {
    soundPrompt.hidden = false;
    soundPrompt.setAttribute('aria-hidden', 'false');
    soundPrompt.tabIndex = 0;
  }

  const onSoundRequest = event => {
    event.preventDefault();
    event.stopPropagation();
    activateLaunchSound(overlay, mode, revealStartedAt, duration);
  };
  soundPrompt?.addEventListener('pointerdown', onSoundRequest);
  soundPrompt?.addEventListener('click', onSoundRequest);

  // Se permite un intento automático únicamente cuando ya existe permiso real.
  if (launchAudioUnlocked && launchMusic) {
    activateLaunchSound(overlay, mode, revealStartedAt, duration);
  }

  const finishProgress = startRevealProgress(duration);

  // En celulares, la versión breve no debe preparar toda la landing
  // mientras anima audio, SVG y escenas. Se difiere hasta el cierre.
  let liveHomePromise = shortMobile ? null : activateLiveHome();
  liveHomePromise?.then(createRevealBusinessPreview).catch(() => {});

  window.setTimeout(() => overlay.classList.add('can-skip'), reducedMotion ? 0 : mode === 'evento' ? 2600 : 1000);

  try {
    if (reducedMotion) {
      setRevealScene(overlay, 'final');
      await Promise.allSettled([liveHomePromise, wait(duration)]);
    } else if (mode === 'evento') {
      await runEventTimeline(overlay, pause);
    } else {
      await runShortTimeline(overlay, pause);
    }

    if (!liveHomePromise) {
      // El overlay sigue cubriendo la pantalla mientras se prepara la landing.
      liveHomePromise = activateLiveHome();
    }
    await liveHomePromise;
    createRevealBusinessPreview();
    setRevealScene(overlay, 'final');
    finishProgress();

    overlay.classList.add('is-opening');
    document.body.classList.add('live-reveal-opening');
    await wait(reducedMotion || skipped ? 220 : OPEN_TRANSITION_MS);

    overlay.classList.add('is-complete');
    document.body.classList.remove('launch-reveal-active', 'live-preparing', 'live-reveal-opening');
    document.body.classList.add('launch-reveal-complete');

    markRevealSeen(state);
    await wait(reducedMotion || skipped ? 20 : 180);
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');

    if (state.presentationTarget === 'directorio') {
      window.location.assign('explorar.html?from=lanzamiento');
    }
  } finally {
    finishProgress();
    stopLaunchAudio();
    soundPrompt?.removeEventListener('pointerdown', onSoundRequest);
    soundPrompt?.removeEventListener('click', onSoundRequest);
    overlay?.classList.remove('sound-active');
    if (soundPrompt) {
      soundPrompt.hidden = true;
      soundPrompt.setAttribute('aria-hidden', 'true');
      soundPrompt.tabIndex = -1;
    }
    document.removeEventListener('keydown', onKeydown);
    revealInProgress = false;
  }
}

async function renderLaunchIdentity(state, { revealMode = null } = {}) {
  const card = document.querySelector('.countdown-card');
  const badge = document.getElementById('launch-badge-primary');
  const status = document.getElementById('launch-status-label');
  const heading = document.getElementById('launch-date-heading');
  const message = document.getElementById('launch-card-message');
  const meta = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const closingEyebrow = document.getElementById('closing-eyebrow');

  card?.classList.toggle('date-pending', !state.hasDate && !state.open);
  card?.classList.toggle('launched', state.open);

  if (state.open) {
    if (badge) badge.innerHTML = '<i></i> Red disponible';
    if (status) status.textContent = 'ALIADOS FANTASMA EN LÍNEA';
    if (heading) heading.innerHTML = '<span>La red ya está activa</span>';
    if (message) message.textContent = 'Explora negocios locales, descubre promociones y conecta directamente con cada comercio.';
    if (meta) meta.content = 'Descubre negocios locales, promociones y perfiles verificados dentro de Aliados Fantasma.';
    if (ogTitle) ogTitle.content = 'Aliados Fantasma | Descubre negocios locales';
    document.title = 'Aliados Fantasma | Negocios locales';

    if (revealMode) {
      await runLaunchReveal(revealMode, state);
    } else {
      document.body.classList.add('launch-reveal-complete');
      await activateLiveHome();
    }
    return;
  }

  deactivateLiveHome();
  document.body.classList.remove('launch-reveal-active', 'live-preparing', 'live-reveal-opening', 'launch-reveal-complete');
  document.title = 'Aliados Fantasma | Próximo lanzamiento';
  if (ogTitle) ogTitle.content = 'Aliados Fantasma | La red local está por despertar';

  if (!state.hasDate) {
    if (badge) badge.innerHTML = '<i></i> Próximo lanzamiento';
    if (status) status.textContent = 'FECHA POR CONFIRMAR';
    if (heading) heading.innerHTML = '<span>Próximamente</span>';
    if (message) message.textContent = 'Regístrate ahora, completa tu información y deja tu perfil preparado mientras confirmamos la fecha oficial.';
    if (meta) meta.content = 'Aliados Fantasma conecta negocios locales con perfiles digitales, promociones, QR y herramientas para crecer. Próximo lanzamiento con fecha por confirmar.';
    if (closingEyebrow) closingEyebrow.textContent = 'PRÓXIMAMENTE COMIENZA UNA NUEVA ETAPA';
    return;
  }

  const dateOnly = formatLaunchDate(state.launchAtIso, { includeTime: false });
  const timeOnly = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(state.launchAtIso));

  if (badge) badge.innerHTML = '<i></i> Lanzamiento programado';
  if (status) status.textContent = 'LANZAMIENTO OFICIAL';
  if (heading) heading.innerHTML = `${dateOnly}<br><span>${timeOnly}</span>`;
  if (message) message.textContent = 'Regístrate ahora, completa tu información con calma y deja tu perfil preparado para el lanzamiento.';
  if (meta) meta.content = `Aliados Fantasma conecta negocios locales con perfiles digitales, promociones y QR. Lanzamiento programado para ${state.launchLabel}.`;
  if (closingEyebrow) closingEyebrow.textContent = `EL ${dateOnly.toUpperCase()} COMIENZA UNA NUEVA ETAPA`;
}

function updateCountdown() {
  if (!launchState) return;
  const progress = document.getElementById('launch-progress');

  if (!launchState.hasDate || launchState.open) {
    setCountdownValues(launchState.open
      ? { days: '00', hours: '00', minutes: '00', seconds: '00' }
      : { days: '--', hours: '--', minutes: '--', seconds: '--' });
    if (progress) progress.style.width = launchState.open ? '100%' : '0%';
    return;
  }

  const now = Date.now() + (launchState.clockOffsetMs || 0);
  const remaining = Math.max(0, launchState.launchAtMs - now);
  const seconds = Math.floor(remaining / 1000);
  setCountdownValues({
    days: pad(Math.floor(seconds / 86400)),
    hours: pad(Math.floor((seconds % 86400) / 3600)),
    minutes: pad(Math.floor((seconds % 3600) / 60)),
    seconds: pad(seconds % 60)
  });

  const windowStart = launchState.launchAtMs - (30 * 86400 * 1000);
  const total = launchState.launchAtMs - windowStart;
  const elapsed = Math.max(0, Math.min(total, now - windowStart));
  if (progress) progress.style.width = `${(elapsed / total) * 100}%`;

  if (remaining === 0 && Date.now() - lastZeroRefreshAt > 10000) {
    lastZeroRefreshAt = Date.now();
    refreshLaunchState();
  }
}

async function refreshLaunchState({ initial = false } = {}) {
  if (launchRefreshInProgress) return;
  launchRefreshInProgress = true;

  try {
    const previousState = launchState;
    clearLaunchStateCache();
    const nextState = await getLaunchState({ refresh: true });
    const transitionedToOpen = Boolean(previousState && !previousState.open && nextState.open);
    const request = getRevealRequest();

    let stateForRender = nextState;
    let revealMode = null;

    if (initial && request.mode && !forcedPresentationConsumed) {
      forcedPresentationConsumed = true;
      if (nextState.open) {
        revealMode = request.mode;
      } else if (request.preview && await isAdministrator()) {
        stateForRender = { ...nextState, open: true, presentationTarget: 'inicio' };
        revealMode = request.mode;
      }
    }

    if (!revealMode) {
      revealMode = shouldRunConfiguredReveal(nextState, { initial, transitionedToOpen });
    }

    launchState = nextState;
    await renderLaunchIdentity(stateForRender, { revealMode });
    updateCountdown();
  } catch (error) {
    console.error('No fue posible actualizar la fecha de lanzamiento.', error);
  } finally {
    launchRefreshInProgress = false;
  }
}

const observer = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 })
  : null;

document.querySelectorAll('.reveal').forEach(element => {
  if (observer) observer.observe(element);
  else element.classList.add('visible');
});

const menuButton = document.querySelector('.menu-button');
const nav = document.getElementById('main-nav');
const drawerClose = document.querySelector('.drawer-close');
const menuBackdrop = document.querySelector('.menu-backdrop');

function openMenu() {
  if (!nav || !menuButton) return;
  nav.classList.add('open');
  document.body.classList.add('menu-open');
  menuButton.setAttribute('aria-expanded', 'true');
  menuButton.setAttribute('aria-label', 'Cerrar menú de navegación');
  window.setTimeout(() => drawerClose?.focus(), 30);
}

function closeMenu({ restoreFocus = false } = {}) {
  if (!nav || !menuButton) return;
  nav.classList.remove('open');
  document.body.classList.remove('menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menú de navegación');
  if (restoreFocus) window.setTimeout(() => menuButton.focus(), 20);
}

menuButton?.addEventListener('click', () => {
  nav?.classList.contains('open') ? closeMenu({ restoreFocus: true }) : openMenu();
});
drawerClose?.addEventListener('click', () => closeMenu({ restoreFocus: true }));
menuBackdrop?.addEventListener('click', () => closeMenu({ restoreFocus: true }));
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav?.classList.contains('open')) closeMenu({ restoreFocus: true });
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 720) closeMenu();
});

await refreshLaunchState({ initial: true });
window.setInterval(updateCountdown, 1000);
window.setInterval(refreshLaunchState, 60000);
