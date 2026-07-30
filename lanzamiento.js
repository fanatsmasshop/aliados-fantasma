import { getLaunchState, clearLaunchStateCache, formatLaunchDate } from './launch-control.js?v=20260730-DATE1';
import { activateLiveHome, deactivateLiveHome } from './home-live.js?v=20260730-LIVE1';

const pad = value => String(Math.max(0, value)).padStart(2, '0');
const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const REVEAL_PREPARE_MS = 3900;
const REVEAL_OPEN_MS = 1150;

let launchState = null;
let launchRefreshInProgress = false;
let revealInProgress = false;
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

function revealWasForced() {
  const params = new URLSearchParams(window.location.search);
  return params.get('reveal') === '1' || params.get('presentacion') === '1';
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
    message.textContent = `${total} negocio${total === 1 ? '' : 's'} ya ${total === 1 ? 'está listo' : 'están listos'} para ser descubierto${total === 1 ? '' : 's'}.`;
  }
}

async function runLaunchReveal() {
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

  const requestSkip = () => {
    if (skipped) return;
    skipped = true;
    skipResolve();
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
  overlay.classList.remove('is-opening', 'is-complete');

  // Fuerza un frame inicial para que las animaciones siempre arranquen desde cero.
  void overlay.offsetWidth;
  overlay.classList.add('is-running');

  const liveHomePromise = activateLiveHome();
  liveHomePromise.then(createRevealBusinessPreview).catch(() => {});

  if (reducedMotion) {
    await Promise.race([liveHomePromise, skipPromise]);
  } else {
    await Promise.race([
      Promise.allSettled([liveHomePromise, wait(REVEAL_PREPARE_MS)]),
      skipPromise
    ]);
    // Si se omitió, de todos modos espera a que el directorio quede preparado.
    if (skipped) await liveHomePromise;
  }

  createRevealBusinessPreview();
  overlay.classList.add('is-opening');
  document.body.classList.add('live-reveal-opening');

  await wait(reducedMotion || skipped ? 180 : REVEAL_OPEN_MS);

  overlay.classList.add('is-complete');
  document.body.classList.remove('launch-reveal-active', 'live-preparing', 'live-reveal-opening');
  document.body.classList.add('launch-reveal-complete');

  await wait(reducedMotion || skipped ? 20 : 180);
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('is-running', 'is-opening', 'is-complete');

  document.removeEventListener('keydown', onKeydown);
  revealInProgress = false;
}

async function renderLaunchIdentity(state, { reveal = false } = {}) {
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

    if (reveal) {
      await runLaunchReveal();
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
  const values = {
    days: pad(Math.floor(seconds / 86400)),
    hours: pad(Math.floor((seconds % 86400) / 3600)),
    minutes: pad(Math.floor((seconds % 3600) / 60)),
    seconds: pad(seconds % 60)
  };
  setCountdownValues(values);

  // La barra representa los últimos 30 días previos al lanzamiento.
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
    const forcedPresentation = initial && revealWasForced() && nextState.open;

    launchState = nextState;
    await renderLaunchIdentity(nextState, {
      reveal: transitionedToOpen || forcedPresentation
    });
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
