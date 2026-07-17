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
  $(selector)?.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

export function closeModal(selector) {
  $(selector)?.classList.add('hidden');
  document.body.classList.remove('modal-open');
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
