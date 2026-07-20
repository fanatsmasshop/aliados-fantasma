import { supabase } from './supabase-client.js?v=20260720-600';
import { getLaunchState, canAccessPublicAreaBeforeLaunch } from './launch-control.js?v=20260720-600';

const launchState = await getLaunchState();
const launched = launchState.open;
if (!await canAccessPublicAreaBeforeLaunch()) location.replace('index.html');

const strip = document.querySelector('.demo-strip');
if (strip) strip.textContent = launched ? '🌐 ALIADOS FANTASMA EN LÍNEA · Explora la red local de negocios.' : '🔐 VISTA PREVIA ADMINISTRATIVA · El público verá esta sección al finalizar la cuenta regresiva.';

const grid = document.querySelector('#business-grid');
const total = document.querySelector('#business-total');
const search = document.querySelector('#business-search');
const menuButton = document.querySelector('#menu-button');
const nav = document.querySelector('#main-nav');
let businesses = [];

menuButton?.addEventListener('click', () => nav?.classList.toggle('open'));
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('open')));

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function render(items) {
  total.textContent = `${items.length} negocio${items.length === 1 ? '' : 's'} disponible${items.length === 1 ? '' : 's'}`;
  if (!items.length) {
    grid.innerHTML = '<article class="business-placeholder">Todavía no hay negocios activos o no encontramos resultados.</article>';
    return;
  }
  grid.innerHTML = items.map(business => {
    const location = [business.colonia,business.municipio].filter(Boolean).join(', ');
    return `<article class="business-card"><div class="business-cover" ${business.portada_url ? `style="background-image:url('${esc(business.portada_url)}')"` : ''}><div class="business-logo">${business.logo_url ? `<img src="${esc(business.logo_url)}" alt="Logo de ${esc(business.nombre)}">` : esc(business.nombre.charAt(0))}</div></div><div class="business-content"><small>${esc(business.categorias?.nombre || 'Negocio aliado')}</small><h3>${esc(business.nombre)}</h3><p>${esc(business.descripcion_corta || 'Conoce este negocio participante de Aliados Fantasma.')}</p><span class="business-location">${esc(location || 'Ubicación por confirmar')}</span><a href="perfil.html?slug=${encodeURIComponent(business.slug)}">Ver perfil digital →</a></div></article>`;
  }).join('');
}

async function loadBusinesses() {
  if (!supabase) {
    grid.innerHTML = '<article class="business-placeholder">La conexión con Supabase no está configurada.</article>';
    total.textContent = 'Demo sin conexión';
    return;
  }
  const { data, error } = await supabase.from('negocios').select('nombre,slug,descripcion_corta,logo_url,portada_url,colonia,municipio,destacado,categorias(nombre)').eq('activo',true).order('destacado',{ascending:false}).order('nombre',{ascending:true});
  if (error) {
    console.error(error);
    grid.innerHTML = `<article class="business-placeholder">No fue posible cargar los negocios: ${esc(error.message)}</article>`;
    total.textContent = 'Información no disponible';
    return;
  }
  businesses = data || [];
  render(businesses);
}

search?.addEventListener('input', () => {
  const term = search.value.trim().toLowerCase();
  render(businesses.filter(business => [business.nombre,business.descripcion_corta,business.colonia,business.municipio,business.categorias?.nombre].some(value => (value || '').toLowerCase().includes(term))));
});

loadBusinesses();
