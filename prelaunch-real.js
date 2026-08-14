import { supabase } from './supabase-client.js?v=20260718-120';
import { esc } from './ui.js?v=20260721-700';

const DEFAULT_LOGO = 'aliados-fantasma-icono.webp';
const grid = document.getElementById('pre2-real-businesses');
const summary = document.getElementById('pre2-real-summary');
const proof = document.getElementById('pre2-network-proof');

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function locationText(business) {
  return [business.municipio, business.estado_region].filter(Boolean).join(', ') || 'México';
}

function cardMarkup(business) {
  const logo = safeUrl(business.logo_url) || DEFAULT_LOGO;
  const cover = safeUrl(business.portada_url) || logo;
  const description = business.descripcion_corta || business.descripcion || 'Negocio local que ya forma parte de Aliados Fantasma.';
  const category = business.categorias?.nombre || 'Negocio aliado';
  return `<article class="pre2-real-card reveal is-visible">
    <div class="pre2-real-cover">
      <img src="${esc(cover)}" alt="" loading="lazy" decoding="async">
      <span class="pre2-real-shade"></span>
      <span class="pre2-real-status"><i></i> Ya forma parte</span>
    </div>
    <div class="pre2-real-body">
      <img class="pre2-real-logo" src="${esc(logo)}" alt="Logo de ${esc(business.nombre)}" loading="lazy" decoding="async">
      <div class="pre2-real-copy">
        <small>${esc(category)}</small>
        <h3>${esc(business.nombre)}</h3>
        <p>${esc(description)}</p>
        <span>⌖ ${esc(locationText(business))}</span>
      </div>
    </div>
  </article>`;
}

async function loadRealBusinesses() {
  if (!grid) return;
  if (!supabase) {
    grid.innerHTML = '<p class="pre2-real-error">No pudimos consultar la red en este momento.</p>';
    return;
  }

  const { data, error, count: totalCount } = await supabase
    .from('negocios')
    .select('id,nombre,slug,descripcion_corta,descripcion,municipio,estado_region,logo_url,portada_url,activo,created_at,categorias(nombre)', { count: 'exact' })
    .eq('activo', true)
    .order('created_at', { ascending: true })
    .limit(6);

  if (error) {
    console.error('Aliados prelaunch:', error);
    grid.innerHTML = '<p class="pre2-real-error">La red está disponible, pero no pudimos cargar los negocios ahora.</p>';
    return;
  }

  const businesses = data || [];
  if (!businesses.length) {
    grid.innerHTML = '<p class="pre2-real-error">Los primeros negocios están terminando de preparar sus perfiles.</p>';
    if (summary) summary.textContent = 'Los primeros perfiles están en preparación.';
    return;
  }

  grid.innerHTML = businesses.map(cardMarkup).join('');
  const visibleCount = businesses.length;
  const count = Number.isFinite(totalCount) ? totalCount : visibleCount;
  if (summary) summary.textContent = `${count} negocio${count === 1 ? '' : 's'} ya ${count === 1 ? 'forma' : 'forman'} parte de la red.`;
  if (proof) proof.textContent = `${count} negocio${count === 1 ? '' : 's'} ya ${count === 1 ? 'está' : 'están'} dentro antes del lanzamiento.`;

  grid.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => {
      if (!img.src.endsWith(DEFAULT_LOGO)) img.src = DEFAULT_LOGO;
    }, { once: true });
  });
}

loadRealBusinesses();
