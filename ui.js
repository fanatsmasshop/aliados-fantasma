export const $ = (selector, root = document) => root.querySelector(selector);

export function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

export function slugify(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function fmt(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date(value));
}

export function toast(message, type = 'success') {
  let box = $('#toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.textContent = message;
  box.appendChild(element);
  setTimeout(() => element.remove(), 3400);
}

export function shell(profile, user) {
  if ($('#user-name')) $('#user-name').textContent = profile.nombre || 'Administrador';
  if ($('#user-email')) $('#user-email').textContent = user.email || '';
  if ($('#user-initial')) $('#user-initial').textContent = (profile.nombre || 'A').charAt(0).toUpperCase();

  $('#menu-button')?.addEventListener('click', () => {
    $('#sidebar')?.classList.add('open');
    $('#overlay')?.classList.remove('hidden');
  });
  $('#overlay')?.addEventListener('click', () => {
    $('#sidebar')?.classList.remove('open');
    $('#overlay')?.classList.add('hidden');
  });
}

export function openModal(selector) {
  const modal = $(selector);
  if (!modal) return;

  // Los paneles administrativos usan contenedores con transform/overflow.
  // Si el modal permanece dentro de ellos, position:fixed puede quedar ligado
  // al documento y abrirse fuera de la parte que el usuario está viendo.
  // Se mueve antes de mostrarlo para evitar ese salto visual.
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.add('af-viewport-modal');
  modal.classList.remove('hidden');
  modal.removeAttribute('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.scrollTop = 0;

  const card = modal.querySelector('.modal-card, .af-modal-card, .rules-card, .context-dialog');
  if (card) card.scrollTop = 0;

  document.body.classList.add('modal-open', 'af-dialog-open');
  document.documentElement.classList.add('af-dialog-open');

  requestAnimationFrame(() => {
    const firstControl = modal.querySelector('[data-close], input:not([type="hidden"]), select, textarea, button:not([disabled]), a[href]');
    if (firstControl instanceof HTMLElement) firstControl.focus({ preventScroll: true });
  });
}

export function closeModal(selector) {
  const modal = $(selector);
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  const anotherModalIsOpen = [...document.querySelectorAll('.modal, .af-modal, .rules-modal, .context-modal, .af-viewport-modal')]
    .some(element => element !== modal
      && !element.hidden
      && !element.classList.contains('hidden')
      && element.getAttribute('aria-hidden') !== 'true'
      && getComputedStyle(element).display !== 'none');

  if (!anotherModalIsOpen) {
    document.body.classList.remove('modal-open', 'af-dialog-open');
    document.documentElement.classList.remove('af-dialog-open');
  }
}

export function setLoading(button, loading, text = 'Guardando…') {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || 'Guardar';
  }
}
