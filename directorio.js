import { supabase } from './supabase-client.js?v=20260721-700';
import { esc } from './ui.js?v=20260721-700';
import { getLaunchState, isAdministrator } from './launch-control.js?v=20260730-DATE1';

const PAGE_SIZE = 12;
const DEFAULT_LOGO = 'aliados-fantasma-icono.webp';

const state = {
  businesses: [], filtered: [], categories: [], visible: PAGE_SIZE,
  query: '', category: '', region: '', municipality: '', open: false,
  promotion: false, sort: 'recommended'
};

const $ = selector => document.querySelector(selector);
const el = {
  content: $('#directory-content'), gate: $('#directory-gate'), gateMessage: $('#gate-message'),
  preview: $('#launch-preview-banner'), search: $('#directory-search'), searchButton: $('#search-button'),
  clear: $('#clear-search'), quick: $('#quick-categories'), category: $('#category-filter'),
  region: $('#region-filter'), municipality: $('#municipality-filter'), open: $('#open-filter'), promotion: $('#promotion-filter'),
  sort: $('#sort-filter'),
  reset: $('#reset-filters'), emptyReset: $('#empty-reset'), grid: $('#directory-grid'),
  empty: $('#directory-empty'), summary: $('#results-summary'), active: $('#active-filters'),
  loadMore: $('#load-more'), toast: $('#directory-toast')
};

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const digits = value => String(value || '').replace(/\D/g, '');
const safeUrl = value => {
  try {
    const url = new URL(String(value || ''), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
};
const dayNumber = () => new Date().getDay() || 7;
const timeMinutes = value => {
  const [hours, minutes] = String(value || '').slice(0, 5).split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

function isOpenNow(business) {
  const hours = business.horarios.find(item => Number(item.dia_semana) === dayNumber());
  if (!hours || hours.cerrado) return false;
  if (hours.abierto_24_horas) return true;
  const current = new Date().getHours() * 60 + new Date().getMinutes();
  const open = timeMinutes(hours.hora_apertura);
  const close = timeMinutes(hours.hora_cierre);
  if (open === null || close === null) return false;
  return close > open ? current >= open && current < close : current >= open || current < close;
}

function activePromotions(business) {
  const now = new Date();
  return business.promociones.filter(item => item.activa !== false &&
    (!item.fecha_inicio || new Date(item.fecha_inicio) <= now) &&
    (!item.fecha_fin || new Date(item.fecha_fin) >= now));
}

function isNewBusiness(business) {
  return Boolean(business.created_at) && Date.now() - new Date(business.created_at).getTime() <= 45 * 86400000;
}

function isTemporarilyClosed(business) {
  const status = normalize(business.estado_operativo || business.estado_negocio || business.estado);
  return ['cerrado_temporalmente', 'cerrado temporalmente', 'temporalmente_cerrado'].includes(status);
}

function completeness(business) {
  const fields = ['nombre', 'descripcion_corta', 'descripcion', 'whatsapp', 'direccion', 'municipio', 'logo_url'];
  return Math.round(fields.filter(key => String(business[key] || '').trim()).length / fields.length * 100);
}

function dailyRotation(id) {
  const day = Math.floor(Date.now() / 86400000);
  let hash = day;
  for (const character of String(id || '')) hash = ((hash << 5) - hash) + character.charCodeAt(0);
  return Math.abs(hash % 1000) / 1000;
}

function relevance(business, query) {
  if (!query) return 0;
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const fields = {
    name: normalize(business.nombre), category: normalize(business.categoria),
    description: normalize(`${business.descripcion_corta || ''} ${business.descripcion || ''}`),
    location: normalize(`${business.colonia || ''} ${business.localidad || ''} ${business.municipio || ''} ${business.estado_region || ''} ${business.direccion || ''}`)
  };
  return terms.reduce((score, term) => score +
    (fields.name === term ? 100 : 0) + (fields.name.includes(term) ? 45 : 0) +
    (fields.category.includes(term) ? 32 : 0) + (fields.location.includes(term) ? 22 : 0) +
    (fields.description.includes(term) ? 10 : 0), 0);
}

function recommendationScore(business) {
  let score = 0;
  score += business.destacado ? 30 : 0;
  score += activePromotions(business).length ? 20 : 0;
  score += Math.round(completeness(business) * 0.15);
  score += isOpenNow(business) ? 10 : 0;
  score += business.verificado ? 10 : 0;
  score += isNewBusiness(business) ? 8 : 0;
  score += business.updated_at && Date.now() - new Date(business.updated_at).getTime() < 30 * 86400000 ? 5 : 0;
  score += dailyRotation(business.id) * 7;
  score += relevance(business, state.query);
  return score;
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.add('hidden'), 2400);
}

function businessLocation(business) {
  return [business.colonia, business.localidad, business.municipio, business.estado_region].filter(Boolean).join(', ') || 'México';
}
function profileUrl(business) { return `perfil.html?slug=${encodeURIComponent(business.slug || '')}`; }
function logoUrl(business) { return safeUrl(business.logo_url) || DEFAULT_LOGO; }
function coverUrl(business) { return safeUrl(business.portada_url); }
function whatsappUrl(business) {
  const phone = digits(business.whatsapp || business.telefono);
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, encontré ${business.nombre} en Aliados Fantasma.`)}` : '';
}

function statusBadges(business) {
  const badges = [];
  if (isTemporarilyClosed(business)) badges.push('<span class="business-badge closed">Cerrado temporalmente</span>');
  else if (isOpenNow(business)) badges.push('<span class="business-badge open">● Abierto</span>');
  if (activePromotions(business).length) badges.push('<span class="business-badge promo">🔥 Promoción</span>');
  return badges.join('');
}

function mediaMarkup(business) {
  const logo = logoUrl(business);
  const cover = coverUrl(business);
  return `<div class="business-media" data-logo="${esc(logo)}" data-name="${esc(business.nombre)}">
    <img class="media-background" src="${esc(cover || logo)}" alt="" loading="lazy" decoding="async">
    <div class="media-shade"></div>
    <img class="business-logo" src="${esc(logo)}" alt="Logo de ${esc(business.nombre)}" loading="lazy" decoding="async">
  </div>`;
}

function cardMarkup(business) {
  const wa = whatsappUrl(business);
  const description = business.descripcion_corta || business.descripcion || 'Conoce este negocio local y todo lo que tiene para ofrecer.';
  return `<article class="business-card" data-id="${esc(business.id)}">
    ${mediaMarkup(business)}
    <div class="business-body">
      <div class="business-badges">${statusBadges(business)}</div>
      <span class="business-category">${esc(business.categoria || 'Negocio local')}</span>
      <h3>${esc(business.nombre)}</h3>
      <p class="business-description">${esc(description)}</p>
      <div class="business-meta"><span>⌖ ${esc(businessLocation(business))}</span></div>
      <div class="business-actions">
        <a class="view-profile" href="${esc(profileUrl(business))}" data-event="profile">Ver detalles</a>
        ${wa ? `<a class="quick-contact" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Contactar a ${esc(business.nombre)} por WhatsApp" data-event="whatsapp">WhatsApp</a>` : '<button class="quick-contact" type="button" disabled>Sin contacto</button>'}
      </div>
    </div>
  </article>`;
}

function bindImageFallbacks(root) {
  root.querySelectorAll('.media-background').forEach(image => {
    const media = image.parentElement;
    const fallback = () => {
      const logo = media.dataset.logo || DEFAULT_LOGO;
      if (image.src.endsWith(logo)) return;
      image.src = logo;
    };
    image.addEventListener('error', fallback, { once: true });
    if (image.complete && image.naturalWidth === 0) fallback();
  });
  root.querySelectorAll('.business-logo').forEach(image => {
    image.addEventListener('error', () => { image.src = DEFAULT_LOGO; }, { once: true });
  });
}

function populateFilters() {
  const represented = [...new Set(state.businesses.map(item => item.categoria).filter(name => name && name !== 'Negocio local'))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const categoryMap = new Map(state.categories.map(category => [category.nombre, category]));
  const availableCategories = represented.map(name => categoryMap.get(name) || { nombre: name, icono: '' });

  el.category.innerHTML = '<option value="">Todas las categorías</option>' + availableCategories
    .map(category => `<option value="${esc(category.nombre)}">${esc(category.nombre)}</option>`).join('');
  const regions = [...new Set(state.businesses.map(item => item.estado_region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  el.region.innerHTML = '<option value="">Todos los estados</option>' + regions
    .map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  populateMunicipalities();

  const quick = [{ nombre: '', etiqueta: 'Todos', icono: '⌂' }, ...availableCategories.slice(0, 7).map(category => ({ ...category, etiqueta: category.nombre }))];
  el.quick.innerHTML = quick.map(category =>
    `<button class="quick-category" type="button" data-category="${esc(category.nombre)}">${esc(category.icono || '')} ${esc(category.etiqueta)}</button>`).join('');
  el.quick.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const selected = button.dataset.category || '';
    state.category = state.category === selected && selected ? '' : selected;
    el.category.value = state.category;
    state.visible = PAGE_SIZE;
    applyFilters();
  }));

  el.search.value = state.query;
  el.category.value = represented.includes(state.category) ? state.category : '';
  if (!el.category.value) state.category = '';
  el.region.value = regions.includes(state.region) ? state.region : '';
  if (!el.region.value) state.region = '';
  populateMunicipalities();
}

function populateMunicipalities() {
  const municipalities = [...new Set(state.businesses
    .filter(item => !state.region || item.estado_region === state.region)
    .map(item => item.municipio).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  el.municipality.innerHTML = '<option value="">Todos los municipios</option>' + municipalities
    .map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (state.municipality && !municipalities.includes(state.municipality)) state.municipality = '';
  el.municipality.value = state.municipality;
}

function filterBusinesses() {
  const query = normalize(state.query);
  return state.businesses.filter(business => {
    if (query && !relevance(business, query)) return false;
    if (state.category && business.categoria !== state.category) return false;
    if (state.region && business.estado_region !== state.region) return false;
    if (state.municipality && business.municipio !== state.municipality) return false;
    if (state.open && !isOpenNow(business)) return false;
    if (state.promotion && !activePromotions(business).length) return false;
    return true;
  });
}

function sortBusinesses(items) {
  return [...items].sort((a, b) => {
    if (state.sort === 'name') return a.nombre.localeCompare(b.nombre, 'es');
    if (state.sort === 'newest') return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    if (state.sort === 'open') return Number(isOpenNow(b)) - Number(isOpenNow(a)) || recommendationScore(b) - recommendationScore(a);
    if (state.sort === 'promotions') return activePromotions(b).length - activePromotions(a).length || recommendationScore(b) - recommendationScore(a);
    return recommendationScore(b) - recommendationScore(a);
  });
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(['query', `Búsqueda: ${state.query}`]);
  if (state.category) chips.push(['category', state.category]);
  if (state.region) chips.push(['region', state.region]);
  if (state.municipality) chips.push(['municipality', state.municipality]);
  if (state.open) chips.push(['open', 'Abiertos ahora']);
  if (state.promotion) chips.push(['promotion', 'Con promoción']);
  el.active.classList.toggle('hidden', !chips.length);
  el.active.innerHTML = chips.map(([key, label]) => `<span class="filter-chip">${esc(label)} <button type="button" data-remove="${key}" aria-label="Quitar filtro ${esc(label)}">×</button></span>`).join('');
  el.active.querySelectorAll('button').forEach(button => button.addEventListener('click', () => removeFilter(button.dataset.remove)));
}

function removeFilter(key) {
  if (key === 'query') { state.query = ''; el.search.value = ''; }
  if (key === 'category') { state.category = ''; el.category.value = ''; }
  if (key === 'region') { state.region = ''; el.region.value = ''; state.municipality = ''; populateMunicipalities(); }
  if (key === 'municipality') { state.municipality = ''; el.municipality.value = ''; }
  if (key === 'open') { state.open = false; el.open.checked = false; }
  if (key === 'promotion') { state.promotion = false; el.promotion.checked = false; }
  state.visible = PAGE_SIZE;
  applyFilters();
}

function renderResults() {
  const shown = state.filtered.slice(0, state.visible);
  el.grid.innerHTML = shown.map(cardMarkup).join('');
  el.empty.classList.toggle('hidden', state.filtered.length > 0);
  el.grid.classList.toggle('hidden', state.filtered.length === 0);
  el.loadMore.classList.toggle('hidden', state.visible >= state.filtered.length);
  el.summary.textContent = `${state.filtered.length} opción${state.filtered.length === 1 ? '' : 'es'}`;
  bindImageFallbacks(el.grid);
  bindTracking(el.grid);
}

function applyFilters({ trackSearch = false } = {}) {
  state.filtered = sortBusinesses(filterBusinesses());
  renderActiveFilters();
  renderResults();
  el.clear.classList.toggle('hidden', !state.query);
  el.quick.querySelectorAll('button').forEach(button => button.classList.toggle('active', (button.dataset.category || '') === state.category));
  const filterCount = [state.query, state.category, state.region, state.municipality, state.open, state.promotion].filter(Boolean).length;
  const filterCountNode = document.querySelector('#directory-filter-count');
  if (filterCountNode) filterCountNode.textContent = filterCount ? `• ${filterCount}` : '';
  if (trackSearch && state.query) trackEvent('busqueda', null, { query: state.query, resultados: state.filtered.length });
}

function resetAll() {
  Object.assign(state, { query: '', category: '', region: '', municipality: '', open: false, promotion: false, sort: 'recommended', visible: PAGE_SIZE });
  el.search.value = ''; el.category.value = ''; el.region.value = ''; populateMunicipalities(); el.municipality.value = '';
  el.open.checked = false; el.promotion.checked = false;
  el.sort.value = 'recommended';
  applyFilters();
}

function readInitialFilters() {
  const params = new URLSearchParams(location.search);
  state.query = String(params.get('q') || '').trim().slice(0, 120);
  state.category = String(params.get('categoria') || '').trim().slice(0, 120);
  state.region = String(params.get('estado') || '').trim().slice(0, 120);
  state.municipality = String(params.get('municipio') || '').trim().slice(0, 120);
}

async function trackEvent(type, businessId = null, metadata = {}) {
  try {
    await supabase.rpc('registrar_evento_directorio', { p_tipo: type, p_negocio_id: businessId, p_consulta: metadata.query || null, p_metadata: metadata });
  } catch { /* Las métricas no bloquean la navegación. */ }
}

function bindTracking(root) {
  root.querySelectorAll('[data-event]').forEach(node => node.addEventListener('click', () => {
    trackEvent(node.dataset.event, node.closest('[data-id]')?.dataset.id || null, { origen: 'directorio' });
  }, { once: true }));
}

function wireEvents() {
  let debounce;
  el.search.addEventListener('input', () => {
    state.query = el.search.value.trim(); state.visible = PAGE_SIZE;
    clearTimeout(debounce); debounce = setTimeout(() => applyFilters(), 180);
  });
  el.search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applyFilters({ trackSearch: true }); } });
  el.searchButton.addEventListener('click', () => { state.query = el.search.value.trim(); state.visible = PAGE_SIZE; applyFilters({ trackSearch: true }); });
  el.clear.addEventListener('click', () => removeFilter('query'));
  el.category.addEventListener('change', () => { state.category = el.category.value; state.visible = PAGE_SIZE; applyFilters(); });
  el.region.addEventListener('change', () => { state.region = el.region.value; state.municipality = ''; populateMunicipalities(); state.visible = PAGE_SIZE; applyFilters(); });
  el.municipality.addEventListener('change', () => { state.municipality = el.municipality.value; state.visible = PAGE_SIZE; applyFilters(); });
  [[el.open, 'open'], [el.promotion, 'promotion']].forEach(([node, key]) =>
    node.addEventListener('change', () => { state[key] = node.checked; state.visible = PAGE_SIZE; applyFilters(); }));
  el.sort.addEventListener('change', () => { state.sort = el.sort.value; applyFilters(); });
  el.reset.addEventListener('click', resetAll);
  el.emptyReset.addEventListener('click', resetAll);
  el.loadMore.addEventListener('click', () => { state.visible += PAGE_SIZE; renderResults(); });
}

async function loadDirectory() {
  el.grid.innerHTML = '<div class="directory-skeleton"></div><div class="directory-skeleton"></div><div class="directory-skeleton"></div>';
  const { data: businesses, error } = await supabase.from('negocios').select('*,categorias(nombre,icono)').eq('activo', true);
  if (error) throw error;
  const ids = (businesses || []).map(item => item.id);
  let promotions = [], hours = [];
  if (ids.length) {
    const [promotionResult, hoursResult] = await Promise.all([
      supabase.from('promociones').select('*').in('negocio_id', ids).eq('activa', true),
      supabase.from('horarios_negocio').select('*').in('negocio_id', ids)
    ]);
    promotions = promotionResult.data || [];
    hours = hoursResult.data || [];
  }
  state.businesses = (businesses || []).map(item => ({
    ...item,
    categoria: item.categorias?.nombre || 'Negocio local',
    categoriaIcono: item.categorias?.icono || '',
    promociones: promotions.filter(promotion => promotion.negocio_id === item.id),
    horarios: hours.filter(schedule => schedule.negocio_id === item.id)
  }));
  const { data: categories } = await supabase.from('categorias').select('nombre,icono,orden').eq('activa', true).order('orden');
  state.categories = categories || [];
  populateFilters();
  applyFilters();
  trackEvent('vista_directorio', null, { negocios: state.businesses.length });
}

async function init() {
  readInitialFilters();
  wireEvents();
  const launch = await getLaunchState();
  const admin = await isAdministrator();
  if (!launch.open && !admin) {
    el.gateMessage.textContent = launch.hasDate
      ? `Se habilitará automáticamente el ${launch.launchLabel}. Mientras tanto, los negocios pueden registrarse y preparar su perfil.`
      : 'La fecha oficial todavía está por confirmar. Los negocios pueden registrarse y preparar su perfil desde ahora.';
    el.gate.classList.remove('hidden');
    return;
  }
  if (!launch.open && admin) el.preview.classList.remove('hidden');
  el.content.classList.remove('hidden');
  try { await loadDirectory(); }
  catch (error) {
    console.error(error);
    el.grid.innerHTML = '';
    el.empty.classList.remove('hidden');
    el.empty.querySelector('h3').textContent = 'No fue posible cargar el directorio';
    el.empty.querySelector('p').textContent = 'Revisa tu conexión e inténtalo nuevamente.';
    el.summary.textContent = 'Error de conexión';
    showToast('No fue posible cargar las opciones');
  }
}

init();
