import { supabase } from './supabase-client.js?v=20260721-700';
import { esc } from './ui.js?v=20260721-700';
import { getLaunchState, isAdministrator, LAUNCH_LABEL } from './launch-control.js?v=20260721-700';

const PAGE_SIZE = 12;
const DEFAULT_LOGO = 'aliados-fantasma-icono.webp';

const state = {
  businesses: [], filtered: [], categories: [], visible: PAGE_SIZE,
  query: '', category: '', municipality: '', open: false,
  promotion: false, isNew: false, featured: false, sort: 'recommended'
};

const $ = selector => document.querySelector(selector);
const el = {
  content: $('#directory-content'), gate: $('#directory-gate'), gateMessage: $('#gate-message'),
  preview: $('#launch-preview-banner'), search: $('#directory-search'), searchButton: $('#search-button'),
  clear: $('#clear-search'), quick: $('#quick-categories'), category: $('#category-filter'),
  municipality: $('#municipality-filter'), open: $('#open-filter'), promotion: $('#promotion-filter'),
  newFilter: $('#new-filter'), featured: $('#featured-filter'), sort: $('#sort-filter'),
  reset: $('#reset-filters'), emptyReset: $('#empty-reset'), grid: $('#directory-grid'),
  empty: $('#directory-empty'), summary: $('#results-summary'), active: $('#active-filters'),
  loadMore: $('#load-more'), featuredSection: $('#featured-section'), featuredGrid: $('#featured-grid'),
  toast: $('#directory-toast')
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
    location: normalize(`${business.colonia || ''} ${business.municipio || ''} ${business.direccion || ''}`)
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
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.add('hidden'), 2400);
}

function businessLocation(business) {
  return [business.colonia, business.municipio].filter(Boolean).join(', ') || business.municipio || 'Estado de México';
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
  if (isNewBusiness(business)) badges.push('<span class="business-badge new">Nuevo</span>');
  if (business.destacado) badges.push('<span class="business-badge featured">★ Destacado</span>');
  return badges.join('');
}

function mediaMarkup(business, variant) {
  const logo = logoUrl(business);
  const cover = coverUrl(business);
  const className = variant === 'featured' ? 'featured-media' : 'business-media';
  const logoClass = variant === 'featured' ? 'featured-logo' : 'business-logo';
  return `<div class="${className}" data-logo="${esc(logo)}" data-name="${esc(business.nombre)}">
    <img class="media-background" src="${esc(cover || logo)}" alt="" loading="lazy" decoding="async">
    <div class="media-shade"></div>
    <img class="${logoClass}" src="${esc(logo)}" alt="Logo de ${esc(business.nombre)}" loading="lazy" decoding="async">
  </div>`;
}

function featuredMarkup(business) {
  const wa = whatsappUrl(business);
  return `<article class="featured-card" data-id="${esc(business.id)}">
    ${mediaMarkup(business, 'featured')}
    <div class="featured-content">
      <div class="business-badges">${statusBadges(business)}</div>
      <h3>${esc(business.nombre)}</h3>
      <p class="featured-category">${esc(business.categoria || 'Negocio aliado')}</p>
      <p class="featured-location">⌖ ${esc(businessLocation(business))}</p>
      <div class="featured-actions">
        <a href="${esc(profileUrl(business))}" data-event="profile">Ver perfil</a>
        ${wa ? `<a class="whatsapp" href="${esc(wa)}" target="_blank" rel="noopener" data-event="whatsapp">WhatsApp</a>` : ''}
      </div>
    </div>
  </article>`;
}

function cardMarkup(business) {
  const wa = whatsappUrl(business);
  const description = business.descripcion_corta || business.descripcion || 'Conoce este negocio local y todo lo que tiene para ofrecer.';
  return `<article class="business-card" data-id="${esc(business.id)}">
    ${mediaMarkup(business, 'card')}
    <div class="business-body">
      <div class="business-badges">${statusBadges(business)}</div>
      <span class="business-category">${esc(business.categoria || 'Negocio aliado')}</span>
      <h3>${esc(business.nombre)}</h3>
      <p class="business-description">${esc(description)}</p>
      <div class="business-meta"><span>⌖ ${esc(businessLocation(business))}</span><span>${completeness(business)}% perfil</span></div>
      <div class="business-actions">
        <a class="view-profile" href="${esc(profileUrl(business))}" data-event="profile">Ver perfil</a>
        ${wa ? `<a class="quick-contact" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Contactar a ${esc(business.nombre)} por WhatsApp" data-event="whatsapp">WA</a>` : '<button class="quick-contact" type="button" disabled>—</button>'}
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
  root.querySelectorAll('.business-logo,.featured-logo').forEach(image => {
    image.addEventListener('error', () => { image.src = DEFAULT_LOGO; }, { once: true });
  });
}

function populateFilters() {
  el.category.innerHTML = '<option value="">Todas las categorías</option>' + state.categories
    .map(category => `<option value="${esc(category.nombre)}">${esc(category.nombre)}</option>`).join('');
  const municipalities = [...new Set(state.businesses.map(item => item.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  el.municipality.innerHTML = '<option value="">Todos los municipios</option>' + municipalities
    .map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  el.quick.innerHTML = state.categories.slice(0, 8).map(category =>
    `<button class="quick-category" type="button" data-category="${esc(category.nombre)}">${esc(category.icono || '')} ${esc(category.nombre)}</button>`).join('');
  el.quick.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.category = state.category === button.dataset.category ? '' : button.dataset.category;
    el.category.value = state.category;
    state.visible = PAGE_SIZE;
    applyFilters();
  }));
}

function filterBusinesses() {
  const query = normalize(state.query);
  return state.businesses.filter(business => {
    if (query && !relevance(business, query)) return false;
    if (state.category && business.categoria !== state.category) return false;
    if (state.municipality && business.municipio !== state.municipality) return false;
    if (state.open && !isOpenNow(business)) return false;
    if (state.promotion && !activePromotions(business).length) return false;
    if (state.isNew && !isNewBusiness(business)) return false;
    if (state.featured && !business.destacado) return false;
    return true;
  });
}

function sortBusinesses(items) {
  return [...items].sort((a, b) => {
    if (state.sort === 'name') return a.nombre.localeCompare(b.nombre, 'es');
    if (state.sort === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    if (state.sort === 'open') return Number(isOpenNow(b)) - Number(isOpenNow(a)) || recommendationScore(b) - recommendationScore(a);
    if (state.sort === 'promotions') return activePromotions(b).length - activePromotions(a).length || recommendationScore(b) - recommendationScore(a);
    return recommendationScore(b) - recommendationScore(a);
  });
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(['query', `Búsqueda: ${state.query}`]);
  if (state.category) chips.push(['category', state.category]);
  if (state.municipality) chips.push(['municipality', state.municipality]);
  if (state.open) chips.push(['open', 'Abiertos ahora']);
  if (state.promotion) chips.push(['promotion', 'Con promoción']);
  if (state.isNew) chips.push(['isNew', 'Nuevos']);
  if (state.featured) chips.push(['featured', 'Destacados']);
  el.active.classList.toggle('hidden', !chips.length);
  el.active.innerHTML = chips.map(([key, label]) => `<span class="filter-chip">${esc(label)} <button type="button" data-remove="${key}" aria-label="Quitar filtro ${esc(label)}">×</button></span>`).join('');
  el.active.querySelectorAll('button').forEach(button => button.addEventListener('click', () => removeFilter(button.dataset.remove)));
}

function removeFilter(key) {
  if (key === 'query') { state.query = ''; el.search.value = ''; }
  if (key === 'category') { state.category = ''; el.category.value = ''; }
  if (key === 'municipality') { state.municipality = ''; el.municipality.value = ''; }
  if (key === 'open') { state.open = false; el.open.checked = false; }
  if (key === 'promotion') { state.promotion = false; el.promotion.checked = false; }
  if (key === 'isNew') { state.isNew = false; el.newFilter.checked = false; }
  if (key === 'featured') { state.featured = false; el.featured.checked = false; }
  state.visible = PAGE_SIZE;
  applyFilters();
}

function renderFeatured() {
  const filteredMode = state.query || state.category || state.municipality || state.open || state.promotion || state.isNew || state.featured;
  if (filteredMode) { el.featuredSection.classList.add('hidden'); return; }
  const selection = sortBusinesses(state.businesses).slice(0, 2);
  el.featuredSection.classList.toggle('hidden', !selection.length);
  el.featuredGrid.innerHTML = selection.map(featuredMarkup).join('');
  bindImageFallbacks(el.featuredGrid);
  bindTracking(el.featuredGrid);
}

function renderResults() {
  const shown = state.filtered.slice(0, state.visible);
  el.grid.innerHTML = shown.map(cardMarkup).join('');
  el.empty.classList.toggle('hidden', state.filtered.length > 0);
  el.grid.classList.toggle('hidden', state.filtered.length === 0);
  el.loadMore.classList.toggle('hidden', state.visible >= state.filtered.length);
  el.summary.textContent = `${state.filtered.length} negocio${state.filtered.length === 1 ? '' : 's'} encontrado${state.filtered.length === 1 ? '' : 's'}`;
  bindImageFallbacks(el.grid);
  bindTracking(el.grid);
}

function applyFilters({ trackSearch = false } = {}) {
  state.filtered = sortBusinesses(filterBusinesses());
  renderActiveFilters();
  renderFeatured();
  renderResults();
  el.clear.classList.toggle('hidden', !state.query);
  el.quick.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.category === state.category));
  if (trackSearch && state.query) trackEvent('busqueda', null, { query: state.query, resultados: state.filtered.length });
}

function resetAll() {
  Object.assign(state, { query: '', category: '', municipality: '', open: false, promotion: false, isNew: false, featured: false, sort: 'recommended', visible: PAGE_SIZE });
  el.search.value = ''; el.category.value = ''; el.municipality.value = '';
  el.open.checked = false; el.promotion.checked = false; el.newFilter.checked = false; el.featured.checked = false;
  el.sort.value = 'recommended';
  applyFilters();
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
  el.municipality.addEventListener('change', () => { state.municipality = el.municipality.value; state.visible = PAGE_SIZE; applyFilters(); });
  [[el.open, 'open'], [el.promotion, 'promotion'], [el.newFilter, 'isNew'], [el.featured, 'featured']].forEach(([node, key]) =>
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
    categoria: item.categorias?.nombre || 'Negocio aliado',
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
  wireEvents();
  const launch = await getLaunchState();
  const admin = await isAdministrator();
  if (!launch.open && !admin) {
    el.gateMessage.textContent = `Se habilitará automáticamente el ${LAUNCH_LABEL}. Mientras tanto, los negocios pueden registrarse y preparar su perfil.`;
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
    showToast('No fue posible cargar los negocios');
  }
}

init();
