import { getLaunchState, clearLaunchStateCache, formatLaunchDate } from './launch-control.js?v=20260730-DATE1';
import { activateLiveHome, deactivateLiveHome } from './home-live.js?v=20260730-LIVE1';

const pad = value => String(Math.max(0, value)).padStart(2, '0');
let launchState = null;

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

function renderLaunchIdentity(state) {
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
    activateLiveHome();
    return;
  }

  deactivateLiveHome();
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

  if (remaining === 0) refreshLaunchState();
}

async function refreshLaunchState() {
  try {
    clearLaunchStateCache();
    launchState = await getLaunchState({ refresh: true });
    renderLaunchIdentity(launchState);
    updateCountdown();
  } catch (error) {
    console.error('No fue posible actualizar la fecha de lanzamiento.', error);
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

await refreshLaunchState();
window.setInterval(updateCountdown, 1000);
window.setInterval(refreshLaunchState, 60000);
