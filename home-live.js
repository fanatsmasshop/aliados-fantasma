import { supabase } from './supabase-client.js?v=20260718-120';
import { esc } from './ui.js?v=20260721-700';

const DEFAULT_LOGO = 'aliados-fantasma-icono.webp';
const state = {
  initialized: false,
  loading: false,
  businesses: [],
  samples: [],
  promotions: []
};

const $ = selector => document.querySelector(selector);
const elements = {
  live: $('#live-experience'),
  prelaunch: $('#prelaunch-experience'),
  need: $('#lo-necesito'),
  search: $('#live-search'),
  searchButton: $('#live-search-button'),
  categories: $('#live-category-list'),
  samples: $('#live-sample-grid'),
  sampleEmpty: $('#live-sample-empty'),
  preview: $('#live-preview-grid'),
  promotions: $('#live-promotion-track'),
  promotionsSection: $('#live-promotions-section'),
  sampleCount: $('#live-sample-count'),
  categoryCount: $('#live-category-count'),
  promotionCount: $('#live-promotion-count'),
  status: $('#live-load-status'),
  brand: document.querySelector('.brand'),
  mobilePrimary: document.querySelector('.mobile-cta a:last-child'),
  mobileSecondary: document.querySelector('.mobile-cta a:first-child')
};

const safeUrl = value => {
  try {
    const url = new URL(String(value || ''), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

function profileUrl(business) {
  return `perfil.html?slug=${encodeURIComponent(business.slug || '')}`;
}

function categoryName(business) {
  return business.categorias?.nombre || business.categoria || 'Negocio local';
}

function locationText(business) {
  return [business.municipio, business.estado_region].filter(Boolean).join(', ') || 'México';
}

function activePromotion(promotion) {
  const now = Date.now();
  const starts = promotion.fecha_inicio ? Date.parse(promotion.fecha_inicio) : null;
  const ends = promotion.fecha_fin ? Date.parse(promotion.fecha_fin) : null;
  return promotion.activa !== false && (!starts || starts <= now) && (!ends || ends >= now);
}

function scoreBusiness(business) {
  return Number(Boolean(business.destacado)) * 100
    + Number(Boolean(safeUrl(business.portada_url))) * 25
    + Number(Boolean(safeUrl(business.logo_url))) * 15
    + Number(Boolean(business.verificado)) * 10;
}

function sortedBusinesses(items) {
  return [...items].sort((a, b) => scoreBusiness(b) - scoreBusiness(a)
    || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function buildSamples(gallery) {
  const byBusiness = new Map();
  gallery.forEach(item => {
    const business = state.businesses.find(candidate => candidate.id === item.negocio_id);
    const image = safeUrl(item.imagen_url);
    if (!business || !image) return;
    if (!byBusiness.has(business.id)) byBusiness.set(business.id, []);
    byBusiness.get(business.id).push({ ...item, image, business, realGallery: true });
  });

  const groups = [...byBusiness.values()];
  const samples = [];
  for (let row = 0; groups.some(group => group[row]); row += 1) {
    groups.forEach(group => { if (group[row]) samples.push(group[row]); });
  }

  if (samples.length) return samples;
  return state.businesses
    .map(business => ({ business, image: safeUrl(business.portada_url), realGallery: false }))
    .filter(item => item.image);
}

function sampleTitle(sample) {
  const business = sample.business;
  return business.descripcion_corta || `Una muestra de ${categoryName(business).toLowerCase()}`;
}

function sampleMarkup(sample) {
  const business = sample.business;
  return `<article class="live-sample-card">
    <a class="live-sample-media" href="${esc(profileUrl(business))}" aria-label="Ver esta muestra en el perfil de ${esc(business.nombre)}">
      <img class="live-sample-image" src="${esc(sample.image)}" alt="Muestra real publicada por ${esc(business.nombre)}" loading="lazy" decoding="async">
      <span>${sample.realGallery ? 'FOTO REAL' : 'PORTADA DEL PERFIL'}</span>
    </a>
    <div class="live-sample-body">
      <p>${esc(categoryName(business))}</p>
      <h3>${esc(sampleTitle(sample))}</h3>
      <div class="live-sample-source"><strong>${esc(business.nombre)}</strong><small>⌖ ${esc(locationText(business))}</small></div>
      <a href="${esc(profileUrl(business))}">Ver perfil y contacto →</a>
    </div>
  </article>`;
}

function previewMarkup(sample) {
  const business = sample.business;
  return `<a class="live-preview-item" href="${esc(profileUrl(business))}">
    <img class="live-sample-image" src="${esc(sample.image)}" alt="Muestra de ${esc(business.nombre)}" loading="eager" decoding="async">
    <span><small>${esc(categoryName(business))}</small><strong>${esc(business.nombre)}</strong></span>
  </a>`;
}

function promotionMarkup(promotion) {
  const business = promotion.business;
  const image = safeUrl(promotion.imagen_url || promotion.portada_url)
    || safeUrl(business.portada_url)
    || DEFAULT_LOGO;
  const title = promotion.titulo || promotion.nombre || 'Promoción publicada';
  return `<article class="live-promo-card">
    <img src="${esc(image)}" alt="Promoción de ${esc(business.nombre)}" loading="lazy" decoding="async">
    <span class="live-promo-shade"></span>
    <div class="live-promo-copy">
      <span>${esc(business.nombre)}</span>
      <h3>${esc(title)}</h3>
      ${promotion.descripcion ? `<p>${esc(promotion.descripcion)}</p>` : ''}
      <a href="${esc(profileUrl(business))}">Ver promoción →</a>
    </div>
  </article>`;
}

function bindImageFallbacks(root = document) {
  root.querySelectorAll('.live-sample-image,.live-promo-card>img').forEach(image => {
    image.addEventListener('error', () => {
      image.src = DEFAULT_LOGO;
      image.classList.add('fallback');
    }, { once: true });
  });
}

function openDirectory(query = '', category = '') {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (category) params.set('categoria', category);
  const suffix = params.toString();
  location.assign(`explorar.html${suffix ? `?${suffix}` : ''}`);
}

function renderCategories() {
  if (!elements.categories) return;
  const totals = new Map();
  state.businesses.forEach(business => {
    const name = categoryName(business);
    if (name === 'Negocio local') return;
    totals.set(name, (totals.get(name) || 0) + 1);
  });
  const categories = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  elements.categories.innerHTML = [
    `<button type="button" data-live-category="">Ver todo <span>${state.businesses.length}</span></button>`,
    ...categories.map(([name, total]) => `<button type="button" data-live-category="${esc(name)}">${esc(name)} <span>${total}</span></button>`)
  ].join('');
  elements.categories.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    openDirectory('', button.dataset.liveCategory || '');
  }));
  if (elements.categoryCount) elements.categoryCount.textContent = String(categories.length);
}

function renderSamples() {
  const visible = state.samples.slice(0, 8);
  if (elements.samples) elements.samples.innerHTML = visible.map(sampleMarkup).join('');
  if (elements.preview) elements.preview.innerHTML = state.samples.slice(0, 3).map(previewMarkup).join('');
  elements.sampleEmpty?.classList.toggle('hidden', visible.length > 0);
  elements.samples?.classList.toggle('hidden', visible.length === 0);
  if (elements.sampleCount) elements.sampleCount.textContent = String(state.samples.length);
  bindImageFallbacks(elements.samples || document);
  bindImageFallbacks(elements.preview || document);
}

function renderPromotions() {
  const promotions = state.promotions.slice(0, 8);
  elements.promotionsSection?.classList.toggle('hidden', !promotions.length);
  if (elements.promotions) elements.promotions.innerHTML = promotions.map(promotionMarkup).join('');
  if (elements.promotionCount) elements.promotionCount.textContent = String(state.promotions.length);
  bindImageFallbacks(elements.promotions || document);
}

function wireLiveEvents() {
  const search = () => openDirectory(elements.search?.value.trim() || '');
  elements.searchButton?.addEventListener('click', search);
  elements.search?.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    search();
  });
}

async function loadLiveContent() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { data, error } = await supabase
    .from('negocios')
    .select('*,categorias(nombre,icono)')
    .eq('activo', true);
  if (error) throw error;

  state.businesses = sortedBusinesses(data || []);
  const ids = state.businesses.map(item => item.id);
  let gallery = [];
  let promotions = [];
  if (ids.length) {
    const [galleryResult, promotionResult] = await Promise.all([
      supabase.from('galeria_negocio').select('negocio_id,imagen_url,orden').in('negocio_id', ids).order('orden'),
      supabase.from('promociones').select('*').in('negocio_id', ids).eq('activa', true)
    ]);
    gallery = galleryResult.data || [];
    promotions = promotionResult.data || [];
  }

  state.samples = buildSamples(gallery);
  state.promotions = promotions
    .filter(activePromotion)
    .map(promotion => ({
      ...promotion,
      business: state.businesses.find(item => item.id === promotion.negocio_id)
    }))
    .filter(item => item.business);
}

function updateLiveNavigation() {
  document.querySelectorAll('[data-mode="prelaunch"]').forEach(node => { node.hidden = true; });
  document.querySelectorAll('[data-mode="live"]').forEach(node => { node.hidden = false; });
  if (elements.brand) elements.brand.href = '#live-home';
  if (elements.mobileSecondary) {
    elements.mobileSecondary.href = '#lo-necesito';
    elements.mobileSecondary.textContent = 'Lo necesito';
  }
  if (elements.mobilePrimary) {
    elements.mobilePrimary.href = 'explorar.html';
    elements.mobilePrimary.textContent = 'Directorio';
  }
}

export async function activateLiveHome() {
  document.body.classList.add('is-live');
  elements.prelaunch?.setAttribute('hidden', '');
  elements.live?.removeAttribute('hidden');
  if (elements.need && elements.live) elements.live.after(elements.need);
  updateLiveNavigation();

  if (state.initialized || state.loading) return;
  state.loading = true;
  wireLiveEvents();
  if (elements.status) elements.status.textContent = 'Cargando muestras reales…';

  try {
    await loadLiveContent();
    renderCategories();
    renderSamples();
    renderPromotions();
    if (elements.status) elements.status.textContent = state.samples.length
      ? `${state.samples.length} muestras reales disponibles para explorar.`
      : 'El directorio está activo y listo para buscar.';
    state.initialized = true;
  } catch (error) {
    console.error('No fue posible cargar el inicio activo.', error);
    if (elements.status) elements.status.textContent = 'No pudimos cargar las muestras en este momento. Puedes abrir el directorio.';
    if (elements.samples) elements.samples.innerHTML = '<div class="live-load-error">No fue posible cargar las muestras. <a href="explorar.html">Abrir directorio</a></div>';
    if (elements.preview) elements.preview.innerHTML = '<a class="live-preview-error" href="explorar.html">Abrir directorio →</a>';
  } finally {
    state.loading = false;
  }
}

export function deactivateLiveHome() {
  document.body.classList.remove('is-live');
  elements.live?.setAttribute('hidden', '');
  elements.prelaunch?.removeAttribute('hidden');
  if (elements.need && elements.live) elements.live.before(elements.need);
  document.querySelectorAll('[data-mode="prelaunch"]').forEach(node => { node.hidden = false; });
  document.querySelectorAll('[data-mode="live"]').forEach(node => { node.hidden = true; });
  if (elements.brand) elements.brand.href = '#inicio';
}
