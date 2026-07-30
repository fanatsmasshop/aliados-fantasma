const ROUTES = {
  index: { href: 'index.html', label: 'Volver al inicio' },
  panel: { href: 'panel.html', label: 'Volver al panel' },
  registro: { href: 'registro.html', label: 'Continuar registro' },
  login: { href: 'login.html', label: 'Volver al acceso' },
  estado: { href: 'estado-cuenta.html', label: 'Volver al estado' },
  ayuda: { href: 'ayuda.html', label: 'Volver a ayuda' },
  directorio: { href: 'explorar.html', label: 'Volver al directorio' }
};

function normalizeSource(value = '') {
  const source = String(value).toLowerCase().trim();
  if (ROUTES[source]) return source;
  if (source.includes('estado-cuenta')) return 'estado';
  if (source.includes('registro')) return 'registro';
  if (source.includes('panel')) return 'panel';
  if (source.includes('login')) return 'login';
  if (source.includes('ayuda')) return 'ayuda';
  if (source.includes('directorio') || source.includes('explorar')) return 'directorio';
  if (source.includes('index') || source === '/' || source === '') return 'index';
  return '';
}

function sourceFromReferrer() {
  if (!document.referrer) return '';
  try {
    const url = new URL(document.referrer);
    if (url.origin !== location.origin) return '';
    return normalizeSource(url.pathname.split('/').pop() || 'index');
  } catch {
    return '';
  }
}

const params = new URLSearchParams(location.search);
const explicit = normalizeSource(params.get('from'));
const referrer = sourceFromReferrer();
const stored = normalizeSource(sessionStorage.getItem('af-info-origin'));
const source = explicit || referrer || stored || 'index';

if (source !== 'ayuda' || !explicit) sessionStorage.setItem('af-info-origin', source);
const route = ROUTES[source] || ROUTES.index;

document.querySelectorAll('[data-context-back]').forEach(link => {
  link.href = route.href;
  link.setAttribute('aria-label', route.label);
  const text = link.querySelector('[data-back-label]');
  if (text) text.textContent = route.label;
  else link.textContent = route.label;
});

// Enlaces entre páginas informativas: volver primero al documento anterior.
document.querySelectorAll('[data-preserve-context]').forEach(link => {
  const href = new URL(link.getAttribute('href'), location.href);
  href.searchParams.set('from', document.body.dataset.infoPage || source);
  link.href = `${href.pathname.split('/').pop()}${href.search}${href.hash}`;
});
