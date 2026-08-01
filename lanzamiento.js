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


let launchAudioContext = null;
let launchAudioNodes = [];
let launchAudioMode = 'breve';
let launchAudioDuration = 0;
let launchNoiseBuffer = null;

function getLaunchAudioContext() {
  if (launchAudioContext) return launchAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  launchAudioContext = new AudioContextClass();
  return launchAudioContext;
}

function rememberAudioNode(node) {
  launchAudioNodes.push(node);
  node.addEventListener?.('ended', () => {
    launchAudioNodes = launchAudioNodes.filter(item => item !== node);
  }, { once: true });
  return node;
}

function stopLaunchAudio() {
  launchAudioNodes.forEach(node => {
    try { node.stop?.(); } catch {}
    try { node.disconnect?.(); } catch {}
  });
  launchAudioNodes = [];
}

function getNoiseBuffer(context) {
  if (launchNoiseBuffer && launchNoiseBuffer.sampleRate === context.sampleRate) return launchNoiseBuffer;
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * .985 + white * .015;
      data[i] = white * .55 + last * .45;
    }
  }
  launchNoiseBuffer = buffer;
  return buffer;
}

function connectWithPan(context, source, destination, pan = 0) {
  if (typeof context.createStereoPanner !== 'function') {
    source.connect(destination);
    return destination;
  }
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(panner).connect(destination);
  launchAudioNodes.push(panner);
  return panner;
}

function makeOsc(context, destination, startAt, duration, options = {}) {
  const {
    frequency = 80,
    endFrequency = frequency,
    gain = .08,
    type = 'sine',
    attack = .03,
    release = .35,
    pan = 0,
    detune = 0
  } = options;
  const oscillator = rememberAudioNode(context.createOscillator());
  const amp = context.createGain();
  oscillator.type = type;
  oscillator.detune.value = detune;
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), startAt);
  if (endFrequency !== frequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startAt + duration);
  }
  const peakAt = startAt + Math.min(attack, duration * .35);
  const releaseAt = Math.max(peakAt + .01, startAt + duration - Math.min(release, duration * .6));
  amp.gain.setValueAtTime(.0001, startAt);
  amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), peakAt);
  amp.gain.setValueAtTime(Math.max(.0002, gain), releaseAt);
  amp.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  oscillator.connect(amp);
  connectWithPan(context, amp, destination, pan);
  launchAudioNodes.push(amp);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + .05);
}

function makeNoise(context, destination, startAt, duration, options = {}) {
  const {
    gain = .08,
    filterType = 'bandpass',
    frequency = 1200,
    endFrequency = frequency,
    q = .8,
    attack = .02,
    release = .2,
    pan = 0
  } = options;
  const source = rememberAudioNode(context.createBufferSource());
  const filter = context.createBiquadFilter();
  const amp = context.createGain();
  source.buffer = getNoiseBuffer(context);
  source.loop = true;
  filter.type = filterType;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(Math.max(40, frequency), startAt);
  if (endFrequency !== frequency) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFrequency), startAt + duration);
  }
  const peakAt = startAt + Math.min(attack, duration * .3);
  const releaseAt = Math.max(peakAt + .01, startAt + duration - Math.min(release, duration * .5));
  amp.gain.setValueAtTime(.0001, startAt);
  amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), peakAt);
  amp.gain.setValueAtTime(Math.max(.0002, gain), releaseAt);
  amp.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  source.connect(filter).connect(amp);
  connectWithPan(context, amp, destination, pan);
  launchAudioNodes.push(filter, amp);
  source.start(startAt);
  source.stop(startAt + duration + .05);
}

function makeKick(context, destination, startAt, strength = 1) {
  makeOsc(context, destination, startAt, .72, {
    frequency: 118,
    endFrequency: 34,
    gain: .34 * strength,
    type: 'sine',
    attack: .006,
    release: .55
  });
  makeNoise(context, destination, startAt, .16, {
    gain: .09 * strength,
    filterType: 'lowpass',
    frequency: 520,
    endFrequency: 110,
    attack: .003,
    release: .12
  });
}

function makeImpact(context, destination, startAt, strength = 1) {
  makeKick(context, destination, startAt, strength);
  makeOsc(context, destination, startAt, 1.1, {
    frequency: 62,
    endFrequency: 27,
    gain: .17 * strength,
    type: 'triangle',
    attack: .01,
    release: .85
  });
  makeNoise(context, destination, startAt, .75, {
    gain: .11 * strength,
    filterType: 'bandpass',
    frequency: 1700,
    endFrequency: 380,
    q: .65,
    release: .6
  });
}

function makeRiser(context, destination, startAt, duration, strength = 1) {
  makeNoise(context, destination, startAt, duration, {
    gain: .075 * strength,
    filterType: 'bandpass',
    frequency: 180,
    endFrequency: 7200,
    q: .65,
    attack: duration * .55,
    release: .06,
    pan: -.25
  });
  makeNoise(context, destination, startAt + .08, Math.max(.1, duration - .08), {
    gain: .055 * strength,
    filterType: 'highpass',
    frequency: 450,
    endFrequency: 9500,
    q: .3,
    attack: duration * .6,
    release: .05,
    pan: .3
  });
  makeOsc(context, destination, startAt, duration, {
    frequency: 95,
    endFrequency: 420,
    gain: .035 * strength,
    type: 'sawtooth',
    attack: duration * .65,
    release: .08
  });
}

function makePulse(context, destination, startAt, note = 110, strength = 1, pan = 0) {
  makeOsc(context, destination, startAt, .42, {
    frequency: note,
    endFrequency: note * .72,
    gain: .105 * strength,
    type: 'triangle',
    attack: .008,
    release: .32,
    pan
  });
  makeOsc(context, destination, startAt, .28, {
    frequency: note * 2,
    endFrequency: note * 1.45,
    gain: .035 * strength,
    type: 'sine',
    attack: .006,
    release: .22,
    pan: -pan
  });
}

function makeChord(context, destination, startAt, duration, root = 55, strength = 1) {
  const ratios = [1, 1.5, 2, 2.5];
  ratios.forEach((ratio, index) => {
    makeOsc(context, destination, startAt + index * .018, duration, {
      frequency: root * ratio,
      endFrequency: root * ratio * 1.035,
      gain: (.045 / (1 + index * .35)) * strength,
      type: index < 2 ? 'sine' : 'triangle',
      attack: Math.min(.8, duration * .25),
      release: Math.min(1.1, duration * .45),
      pan: [-.35, .35, -.15, .15][index]
    });
  });
}

function scheduleLaunchAudio(mode, elapsedMs, durationMs) {
  const context = getLaunchAudioContext();
  if (!context || context.state !== 'running') return false;

  stopLaunchAudio();
  launchAudioMode = mode;
  launchAudioDuration = durationMs;

  const elapsed = Math.max(0, elapsedMs / 1000);
  const total = durationMs / 1000;
  const remaining = Math.max(.18, total - elapsed);
  const now = context.currentTime + .045;

  const master = context.createGain();
  const lowShelf = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const limiter = context.createDynamicsCompressor();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 180;
  lowShelf.gain.value = 3.5;
  compressor.threshold.value = -19;
  compressor.knee.value = 20;
  compressor.ratio.value = 4;
  compressor.attack.value = .008;
  compressor.release.value = .22;
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 18;
  limiter.attack.value = .002;
  limiter.release.value = .08;
  master.gain.setValueAtTime(.0001, now);
  master.gain.exponentialRampToValueAtTime(.72, now + .28);
  master.gain.setValueAtTime(.72, Math.max(now + .3, now + remaining - .65));
  master.gain.exponentialRampToValueAtTime(.0001, now + remaining);
  master.connect(lowShelf).connect(compressor).connect(limiter).connect(context.destination);
  launchAudioNodes.push(master, lowShelf, compressor, limiter);

  // Cama ambiental: grave estable + acorde cinematográfico suave.
  const root = mode === 'evento' ? 46.25 : 55;
  makeOsc(context, master, now, remaining, {
    frequency: root,
    endFrequency: root * 1.08,
    gain: .075,
    type: 'sine',
    attack: .65,
    release: .65,
    pan: -.08
  });
  makeOsc(context, master, now, remaining, {
    frequency: root * 1.5,
    endFrequency: root * 1.58,
    gain: .025,
    type: 'triangle',
    attack: .9,
    release: .7,
    pan: .1
  });
  makeChord(context, master, now, remaining, root, .75);

  // Aire estéreo sutil para evitar un sonido plano o monofónico.
  makeNoise(context, master, now, remaining, {
    gain: .018,
    filterType: 'highpass',
    frequency: 2600,
    endFrequency: 4200,
    attack: 1.1,
    release: .8,
    pan: -.55
  });
  makeNoise(context, master, now + .1, Math.max(.1, remaining - .1), {
    gain: .015,
    filterType: 'highpass',
    frequency: 3100,
    endFrequency: 5200,
    attack: 1.2,
    release: .8,
    pan: .55
  });

  const cues = mode === 'evento'
    ? [
        { t: 0, type: 'impact', s: .78 },
        { t: 2.8, type: 'pulse', n: 92, s: .75 },
        { t: 5.8, type: 'pulse', n: 110, s: .82 },
        { t: 8.5, type: 'impact', s: .82 },
        { t: 11.2, type: 'pulse', n: 123.5, s: .88 },
        { t: 14.1, type: 'riser', d: 2.1, s: .82 },
        { t: 16.25, type: 'impact', s: .95 },
        { t: 19.2, type: 'pulse', n: 138.6, s: .9 },
        { t: 21.2, type: 'riser', d: 3.8, s: 1.05 },
        { t: 25.1, type: 'impact', s: 1.18 },
        { t: 26.15, type: 'pulse', n: 164.8, s: 1.08 },
        { t: 27.05, type: 'impact', s: 1.32 }
      ]
    : [
        { t: 0, type: 'impact', s: .9 },
        { t: 1.55, type: 'pulse', n: 110, s: .9 },
        { t: 3.1, type: 'pulse', n: 138.6, s: 1 },
        { t: 4.35, type: 'riser', d: 2.15, s: 1.05 },
        { t: 6.55, type: 'impact', s: 1.18 },
        { t: 7.35, type: 'impact', s: 1.35 }
      ];

  cues.forEach((cue, index) => {
    if (cue.t < elapsed - .12) return;
    const at = now + Math.max(0, cue.t - elapsed);
    if (cue.type === 'impact') makeImpact(context, master, at, cue.s);
    if (cue.type === 'pulse') makePulse(context, master, at, cue.n, cue.s, index % 2 ? .24 : -.24);
    if (cue.type === 'riser') makeRiser(context, master, at, Math.min(cue.d, Math.max(.15, total - cue.t)), cue.s);
  });

  return true;
}

async function activateLaunchSound(overlay, mode, startedAt, duration) {
  const context = getLaunchAudioContext();
  if (!context) return false;
  try {
    if (context.state !== 'running') await context.resume();
    const elapsed = Math.min(duration - 50, Math.max(0, performance.now() - startedAt));
    const started = scheduleLaunchAudio(mode, elapsed, duration);
    overlay?.classList.toggle('sound-active', started);
    return started;
  } catch {
    return false;
  }
}

function prepareLaunchSoundFromInteraction() {
  const context = getLaunchAudioContext();
  if (!context) return;
  context.resume().catch(() => {});
}

document.addEventListener('pointerdown', prepareLaunchSoundFromInteraction, { once: true, passive: true });
document.addEventListener('keydown', prepareLaunchSoundFromInteraction, { once: true });

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
    if (!active && scene.classList.contains('is-active')) scene.classList.add('is-leaving');
    scene.classList.toggle('is-active', active);
    if (active) scene.classList.remove('is-leaving');
  });

  [...overlay.classList]
    .filter(name => name.startsWith('scene-'))
    .forEach(name => overlay.classList.remove(name));
  overlay.classList.add(`scene-${sceneName}`);
}

function pulseCount(scene, value) {
  const count = document.getElementById('launch-final-count');
  if (count) count.textContent = value;
  scene?.classList.remove('count-pulse');
  void scene?.offsetWidth;
  scene?.classList.add('count-pulse');
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

const REVEAL_COPY_OUT_MS = 280;
const REVEAL_COPY_IN_MS = 520;

async function transitionRevealCopy(element, nextText, pause) {
  if (!element) return true;

  element.classList.add('launch-dynamic-copy');
  const normalizedNext = String(nextText ?? '');
  if ((element.textContent || '').trim() === normalizedNext.trim()) return true;

  const cleanup = () => {
    element.classList.remove('is-copy-leaving', 'is-copy-entering');
  };

  cleanup();
  element.classList.add('is-copy-leaving');
  if (!await pause(REVEAL_COPY_OUT_MS)) {
    cleanup();
    return false;
  }

  element.textContent = normalizedNext;
  element.classList.remove('is-copy-leaving');
  void element.offsetWidth;
  element.classList.add('is-copy-entering');

  const completed = await pause(REVEAL_COPY_IN_MS);
  cleanup();
  return completed;
}

async function runEventTimeline(overlay, pause) {
  setRevealScene(overlay, 'intro');
  if (!await pause(3000)) return;

  setRevealScene(overlay, 'story');
  const story = document.getElementById('launch-story-line');
  if (story) {
    story.textContent = 'Cada negocio tiene una historia.';
    story.classList.add('launch-dynamic-copy');
  }
  if (!await pause(2500)) return;
  if (!await transitionRevealCopy(story, 'Pero muchas historias aún esperan ser descubiertas.', pause)) return;
  if (!await pause(1700)) return;

  const status = document.getElementById('launch-connection-status');
  if (status) {
    status.textContent = 'Conectando negocios…';
    status.classList.add('launch-dynamic-copy');
  }
  setRevealScene(overlay, 'connection');
  createRevealBusinessPreview();
  if (!await pause(2000)) return;
  if (!await transitionRevealCopy(status, 'Activando perfiles…', pause)) return;
  if (!await pause(1200)) return;
  if (!await transitionRevealCopy(status, 'Construyendo comunidad…', pause)) return;
  if (!await pause(1200)) return;

  setRevealScene(overlay, 'identity');
  if (!await pause(5000)) return;

  const word = document.getElementById('launch-promise-word');
  if (word) {
    word.textContent = 'Descubre.';
    word.classList.add('launch-dynamic-copy');
  }
  setRevealScene(overlay, 'promise');
  if (!await pause(1000)) return;
  for (const value of ['Conecta.', 'Crece.', 'Juntos.']) {
    if (!await transitionRevealCopy(word, value, pause)) return;
    if (!await pause(200)) return;
  }

  setRevealScene(overlay, 'count');
  const countScene = overlay.querySelector('[data-scene="count"]');
  for (const value of ['3', '2', '1']) {
    pulseCount(countScene, value);
    if (!await pause(1000)) return;
  }

  setRevealScene(overlay, 'final');
  createRevealBusinessPreview();
  await pause(2000);
}

async function runShortTimeline(overlay, pause) {
  setRevealScene(overlay, 'identity');
  if (!await pause(2200)) return;

  const status = document.getElementById('launch-connection-status');
  if (status) {
    status.textContent = 'Abriendo la red…';
    status.classList.add('launch-dynamic-copy');
  }
  setRevealScene(overlay, 'connection');
  createRevealBusinessPreview();
  if (!await pause(2500)) return;

  setRevealScene(overlay, 'final');
  createRevealBusinessPreview();
  await pause(3300);
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
  if (modeLabel) modeLabel.textContent = mode === 'evento' ? 'EVENTO CINEMATOGRÁFICO' : 'PRESENTACIÓN BREVE';

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
  void overlay.offsetWidth;
  overlay.classList.add('is-running');
  overlay.classList.remove('sound-active');

  const onSoundRequest = async () => {
    await activateLaunchSound(overlay, mode, revealStartedAt, duration);
  };
  soundPrompt?.addEventListener('click', onSoundRequest);

  // Si el visitante ya interactuó antes del cero, el audio puede arrancar de inmediato.
  if (launchAudioContext?.state === 'running') {
    activateLaunchSound(overlay, mode, revealStartedAt, duration);
  }

  const finishProgress = startRevealProgress(duration);
  const liveHomePromise = activateLiveHome();
  liveHomePromise.then(createRevealBusinessPreview).catch(() => {});

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
    soundPrompt?.removeEventListener('click', onSoundRequest);
    overlay?.classList.remove('sound-active');
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
