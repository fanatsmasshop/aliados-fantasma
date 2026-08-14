import { supabase } from './supabase-client.js?v=20260718-120';
import { esc } from './ui.js?v=20260721-700';

const DEFAULT_LOGO = 'aliados-fantasma-icono.webp';
const state = {
  initialized: false,
  loading: false,
  businesses: [],
  filtered: [],
  promotions: [],
  category: '',
  query: '',
  currentSlide: 0,
  slideTimer: null,
  pointerStartX: null
};

const $ = selector => document.querySelector(selector);
const elements = {
  live: $('#live-experience'),
  prelaunch: $('#prelaunch-experience'),
  slider: $('#live-slider'),
  sliderDots: $('#live-slider-dots'),
  prev: $('#live-slider-prev'),
  next: $('#live-slider-next'),
  search: $('#live-search'),
  searchButton: $('#live-search-button'),
  categories: $('#live-category-list'),
  featured: $('#live-featured-grid'),
  featuredSection: $('#live-featured-section'),
  promotions: $('#live-promotion-track'),
  promotionsSection: $('#live-promotions-section'),
  grid: $('#live-business-grid'),
  empty: $('#live-empty'),
  resultCount: $('#live-result-count'),
  businessCount: $('#live-business-count'),
  categoryCount: $('#live-category-count'),
  promotionCount: $('#live-promotion-count'),
  status: $('#live-load-status'),
  brand: document.querySelector('.brand'),
  mobilePrimary: document.querySelector('.mobile-cta a:last-child'),
  mobileSecondary: document.querySelector('.mobile-cta a:first-child')
};

const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function profileUrl(business) {
  return `perfil.html?slug=${encodeURIComponent(business.slug || '')}`;
}

function logoUrl(business) {
  return safeUrl(business.logo_url) || DEFAULT_LOGO;
}

function coverUrl(business) {
  return safeUrl(business.portada_url) || logoUrl(business);
}

function categoryName(business) {
  return business.categorias?.nombre || business.categoria || 'Negocio aliado';
}

function locationText(business) {
  return [business.colonia, business.localidad, business.municipio, business.estado_region].filter(Boolean).join(', ') || 'México';
}

function activePromotions(business) {
  const now = Date.now();
  return (business.promociones || []).filter(item => {
    const starts = item.fecha_inicio ? Date.parse(item.fecha_inicio) : null;
    const ends = item.fecha_fin ? Date.parse(item.fecha_fin) : null;
    return item.activa !== false && (!starts || starts <= now) && (!ends || ends >= now);
  });
}

function isNewBusiness(business) {
  const created = Date.parse(business.created_at || '');
  return Number.isFinite(created) && Date.now() - created < 45 * 86400000;
}

function scoreBusiness(business) {
  let score = 0;
  if (business.destacado) score += 100;
  if (activePromotions(business).length) score += 45;
  if (safeUrl(business.portada_url)) score += 25;
  if (safeUrl(business.logo_url)) score += 15;
  if (business.verificado) score += 10;
  if (isNewBusiness(business)) score += 8;
  return score;
}

function sortedBusinesses(items) {
  return [...items].sort((a, b) => scoreBusiness(b) - scoreBusiness(a) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function whatsappUrl(business) {
  const phone = digits(business.whatsapp || business.telefono);
  if (!phone) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, encontré ${business.nombre} en Aliados Fantasma.`)}`;
}

function badgeMarkup(business) {
  const badges = [];
  if (business.destacado) badges.push('<span class="live-tag featured">★ Destacado</span>');
  if (activePromotions(business).length) badges.push('<span class="live-tag promo">Promoción</span>');
  if (isNewBusiness(business)) badges.push('<span class="live-tag new">Nuevo</span>');
  return badges.join('');
}

function sliderMarkup(business, index) {
  const description = business.descripcion_corta || business.descripcion || 'Descubre lo que este negocio local tiene preparado para ti.';
  const background = coverUrl(business);
  const logo = logoUrl(business);
  return `<article class="live-slide${index === 0 ? ' active' : ''}" data-slide="${index}" aria-hidden="${index === 0 ? 'false' : 'true'}">
    <img class="live-slide-bg" src="${esc(background)}" alt="" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    <div class="live-slide-overlay"></div>
    <div class="live-slide-content">
      <div class="live-slide-tags">${badgeMarkup(business)}<span class="live-tag category">${esc(categoryName(business))}</span></div>
      <img class="live-slide-logo" src="${esc(logo)}" alt="Logo de ${esc(business.nombre)}" decoding="async">
      <p class="live-slide-kicker">NEGOCIO DE LA RED</p>
      <h1>${esc(business.nombre)}</h1>
      <p class="live-slide-description">${esc(description)}</p>
      <p class="live-slide-location">⌖ ${esc(locationText(business))}</p>
      <div class="live-slide-actions">
        <a class="button button-primary" href="${esc(profileUrl(business))}">Ver negocio <span>→</span></a>
        <a class="button button-secondary" href="explorar.html">Explorar directorio</a>
      </div>
    </div>
  </article>`;
}

function businessCardMarkup(business, compact = false) {
  const description = business.descripcion_corta || business.descripcion || 'Conoce este negocio local y todo lo que ofrece.';
  const wa = whatsappUrl(business);
  return `<article class="live-business-card${compact ? ' compact' : ''}">
    <a class="live-card-media" href="${esc(profileUrl(business))}" aria-label="Ver ${esc(business.nombre)}">
      <img class="live-card-cover" src="${esc(coverUrl(business))}" alt="" loading="lazy" decoding="async">
      <span class="live-card-shade"></span>
      <img class="live-card-logo" src="${esc(logoUrl(business))}" alt="Logo de ${esc(business.nombre)}" loading="lazy" decoding="async">
      <span class="live-card-badges">${badgeMarkup(business)}</span>
    </a>
    <div class="live-card-body">
      <p class="live-card-category">${esc(categoryName(business))}</p>
      <h3>${esc(business.nombre)}</h3>
      <p class="live-card-location">⌖ ${esc(locationText(business))}</p>
      ${compact ? '' : `<p class="live-card-description">${esc(description)}</p>`}
      <div class="live-card-actions">
        <a href="${esc(profileUrl(business))}">Ver perfil</a>
        ${wa ? `<a class="live-wa" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>
    </div>
  </article>`;
}

function promotionMarkup(promotion) {
  const business = promotion.business;
  const title = promotion.titulo || promotion.nombre || 'Promoción especial';
  const description = promotion.descripcion || promotion.detalle || `Disponible en ${business.nombre}.`;
  const image = safeUrl(promotion.imagen_url || promotion.portada_url) || coverUrl(business);
  return `<article class="live-promo-card">
    <img src="${esc(image)}" alt="" loading="lazy" decoding="async">
    <span class="live-promo-shade"></span>
    <div class="live-promo-copy">
      <span>${esc(business.nombre)}</span>
      <h3>${esc(title)}</h3>
      <p>${esc(description)}</p>
      <a href="${esc(profileUrl(business))}">Ver promoción →</a>
    </div>
  </article>`;
}

function bindImageFallbacks(root = document) {
  root.querySelectorAll('.live-slide-bg,.live-card-cover').forEach(image => {
    image.addEventListener('error', () => {
      image.src = DEFAULT_LOGO;
      image.classList.add('fallback');
    }, { once: true });
  });
  root.querySelectorAll('.live-slide-logo,.live-card-logo').forEach(image => {
    image.addEventListener('error', () => { image.src = DEFAULT_LOGO; }, { once: true });
  });
}

function renderSlider() {
  if (!elements.slider) return;
  const candidates = sortedBusinesses(state.businesses)
    .sort((a, b) => Number(Boolean(safeUrl(b.portada_url))) - Number(Boolean(safeUrl(a.portada_url))) || scoreBusiness(b) - scoreBusiness(a))
    .slice(0, 6);

  if (!candidates.length) {
    elements.slider.innerHTML = `<article class="live-slide active live-slide-empty"><div class="live-slide-content"><p class="live-slide-kicker">ALIADOS FANTASMA</p><h1>La red ya está activa.</h1><p class="live-slide-description">Muy pronto aparecerán aquí los primeros negocios publicados.</p><div class="live-slide-actions"><a class="button button-primary" href="registro.html">Registrar mi negocio</a></div></div></article>`;
    elements.sliderDots.innerHTML = '';
    elements.prev.hidden = true;
    elements.next.hidden = true;
    return;
  }

  state.currentSlide = 0;
  elements.slider.innerHTML = candidates.map(sliderMarkup).join('');
  elements.sliderDots.innerHTML = candidates.map((_, index) => `<button type="button" class="${index === 0 ? 'active' : ''}" data-slide-dot="${index}" aria-label="Mostrar banner ${index + 1}"></button>`).join('');
  elements.prev.hidden = candidates.length < 2;
  elements.next.hidden = candidates.length < 2;
  elements.sliderDots.querySelectorAll('button').forEach(button => button.addEventListener('click', () => showSlide(Number(button.dataset.slideDot), true)));
  bindImageFallbacks(elements.slider);
  startSlider();
}

function showSlide(index, restart = false) {
  const slides = [...elements.slider.querySelectorAll('.live-slide')];
  if (!slides.length) return;
  state.currentSlide = (index + slides.length) % slides.length;
  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === state.currentSlide;
    slide.classList.toggle('active', active);
    slide.setAttribute('aria-hidden', String(!active));
  });
  elements.sliderDots.querySelectorAll('button').forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === state.currentSlide));
  if (restart) startSlider();
}

function startSlider() {
  clearInterval(state.slideTimer);
  const count = elements.slider?.querySelectorAll('.live-slide').length || 0;
  if (count < 2 || document.hidden) return;
  state.slideTimer = window.setInterval(() => showSlide(state.currentSlide + 1), 6500);
}

function renderCategories() {
  if (!elements.categories) return;
  const totals = new Map();
  state.businesses.forEach(business => {
    const name = categoryName(business);
    totals.set(name, (totals.get(name) || 0) + 1);
  });
  const categories = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  elements.categories.innerHTML = [
    `<button type="button" class="active" data-live-category="">Todos <span>${state.businesses.length}</span></button>`,
    ...categories.map(([name, total]) => `<button type="button" data-live-category="${esc(name)}">${esc(name)} <span>${total}</span></button>`)
  ].join('');
  elements.categories.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.category = button.dataset.liveCategory || '';
    elements.categories.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    applyFilters();
    $('#live-businesses')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  if (elements.categoryCount) elements.categoryCount.textContent = String(categories.length);
}

function renderFeatured() {
  const featured = sortedBusinesses(state.businesses).slice(0, 4);
  elements.featuredSection?.classList.toggle('hidden', !featured.length);
  if (elements.featured) {
    elements.featured.innerHTML = featured.map(item => businessCardMarkup(item, true)).join('');
    bindImageFallbacks(elements.featured);
  }
}

function renderPromotions() {
  const promotions = state.promotions.slice(0, 8);
  elements.promotionsSection?.classList.toggle('hidden', !promotions.length);
  if (elements.promotions) {
    elements.promotions.innerHTML = promotions.map(promotionMarkup).join('');
    bindImageFallbacks(elements.promotions);
  }
  if (elements.promotionCount) elements.promotionCount.textContent = String(state.promotions.length);
}

function applyFilters() {
  const query = normalize(state.query);
  state.filtered = state.businesses.filter(business => {
    const category = categoryName(business);
    if (state.category && category !== state.category) return false;
    if (!query) return true;
    const haystack = normalize([
      business.nombre,
      business.descripcion_corta,
      business.descripcion,
      category,
      business.colonia,
      business.localidad,
      business.municipio,
      business.estado_region
    ].join(' '));
    return haystack.includes(query);
  });
  renderAllBusinesses();
}

function renderAllBusinesses() {
  if (!elements.grid) return;
  elements.grid.innerHTML = state.filtered.map(item => businessCardMarkup(item)).join('');
  elements.empty?.classList.toggle('hidden', state.filtered.length > 0);
  elements.grid.classList.toggle('hidden', state.filtered.length === 0);
  if (elements.resultCount) elements.resultCount.textContent = `${state.filtered.length} negocio${state.filtered.length === 1 ? '' : 's'}`;
  bindImageFallbacks(elements.grid);
}

function wireLiveEvents() {
  elements.prev?.addEventListener('click', () => showSlide(state.currentSlide - 1, true));
  elements.next?.addEventListener('click', () => showSlide(state.currentSlide + 1, true));
  elements.slider?.addEventListener('pointerdown', event => { state.pointerStartX = event.clientX; });
  elements.slider?.addEventListener('pointerup', event => {
    if (state.pointerStartX === null) return;
    const distance = event.clientX - state.pointerStartX;
    state.pointerStartX = null;
    if (Math.abs(distance) < 45) return;
    showSlide(state.currentSlide + (distance < 0 ? 1 : -1), true);
  });
  elements.slider?.addEventListener('mouseenter', () => clearInterval(state.slideTimer));
  elements.slider?.addEventListener('mouseleave', startSlider);
  elements.slider?.addEventListener('focusin', () => clearInterval(state.slideTimer));
  elements.slider?.addEventListener('focusout', startSlider);
  document.addEventListener('visibilitychange', startSlider);

  let debounce;
  elements.search?.addEventListener('input', () => {
    state.query = elements.search.value.trim();
    clearTimeout(debounce);
    debounce = setTimeout(applyFilters, 160);
  });
  elements.search?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      state.query = elements.search.value.trim();
      applyFilters();
      $('#live-businesses')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  elements.searchButton?.addEventListener('click', () => {
    state.query = elements.search?.value.trim() || '';
    applyFilters();
    $('#live-businesses')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function loadBusinesses() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { data, error } = await supabase
    .from('negocios')
    .select('*,categorias(nombre,icono)')
    .eq('activo', true);
  if (error) throw error;

  const businesses = data || [];
  const ids = businesses.map(item => item.id);
  let promotions = [];
  if (ids.length) {
    const result = await supabase
      .from('promociones')
      .select('*')
      .in('negocio_id', ids)
      .eq('activa', true);
    promotions = result.data || [];
  }

  state.businesses = sortedBusinesses(businesses.map(business => ({
    ...business,
    promociones: promotions.filter(promotion => promotion.negocio_id === business.id)
  })));
  state.promotions = promotions
    .map(promotion => ({ ...promotion, business: state.businesses.find(item => item.id === promotion.negocio_id) }))
    .filter(item => item.business)
    .filter(item => activePromotions({ promociones: [item] }).length)
    .slice(0, 20);
  state.filtered = [...state.businesses];
}

function updateLiveNavigation() {
  document.querySelectorAll('[data-mode="prelaunch"]').forEach(node => { node.hidden = true; });
  document.querySelectorAll('[data-mode="live"]').forEach(node => { node.hidden = false; });
  if (elements.brand) elements.brand.href = '#live-home';
  if (elements.mobileSecondary) {
    elements.mobileSecondary.href = 'explorar.html';
    elements.mobileSecondary.textContent = 'Directorio';
  }
  if (elements.mobilePrimary) {
    elements.mobilePrimary.href = 'login.html';
    elements.mobilePrimary.textContent = 'Mi cuenta';
  }
}

export async function activateLiveHome() {
  document.body.classList.add('is-live');
  elements.prelaunch?.setAttribute('hidden', '');
  elements.live?.removeAttribute('hidden');
  updateLiveNavigation();

  if (state.initialized || state.loading) return;
  state.loading = true;
  wireLiveEvents();
  if (elements.status) elements.status.textContent = 'Cargando negocios de la red…';

  try {
    await loadBusinesses();
    renderSlider();
    renderCategories();
    renderFeatured();
    renderPromotions();
    renderAllBusinesses();
    if (elements.businessCount) elements.businessCount.textContent = String(state.businesses.length);
    if (elements.status) elements.status.textContent = state.businesses.length
      ? 'Explora, descubre y conecta con negocios locales.'
      : 'La red está activa. Los primeros negocios aparecerán muy pronto.';
    state.initialized = true;
  } catch (error) {
    console.error('No fue posible cargar el inicio activo.', error);
    if (elements.status) elements.status.textContent = 'No pudimos cargar los negocios en este momento.';
    if (elements.grid) elements.grid.innerHTML = '<div class="live-load-error">No fue posible cargar el directorio. <a href="explorar.html">Abrir directorio completo</a></div>';
  } finally {
    state.loading = false;
  }
}

export function deactivateLiveHome() {
  document.body.classList.remove('is-live');
  elements.live?.setAttribute('hidden', '');
  elements.prelaunch?.removeAttribute('hidden');
  document.querySelectorAll('[data-mode="prelaunch"]').forEach(node => { node.hidden = false; });
  document.querySelectorAll('[data-mode="live"]').forEach(node => { node.hidden = true; });
  if (elements.brand) elements.brand.href = '#inicio';
  clearInterval(state.slideTimer);
}
