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

function buildSamples(businesses, gallery) {
  const groups = businesses.map(business => gallery
    .filter(item => item.negocio_id === business.id && safeUrl(item.imagen_url))
    .map(item => ({ business, image: safeUrl(item.imagen_url), realGallery: true })))
    .filter(group => group.length);
  const samples = [];
  for (let row = 0; groups.some(group => group[row]); row += 1) {
    groups.forEach(group => { if (group[row]) samples.push(group[row]); });
  }
  if (samples.length) return samples;
  return businesses
    .map(business => ({ business, image: safeUrl(business.portada_url), realGallery: false }))
    .filter(item => item.image);
}

function cardMarkup(sample) {
  const business = sample.business;
  const description = business.descripcion_corta || business.descripcion || 'Muestra publicada en un perfil real de Aliados Fantasma.';
  const category = business.categorias?.nombre || 'Negocio local';
  return `<article class="pre2-real-card pre2-sample-card">
    <div class="pre2-real-cover">
      <img src="${esc(sample.image)}" alt="Muestra real publicada por ${esc(business.nombre)}" loading="lazy" decoding="async">
      <span class="pre2-real-shade"></span>
      <span class="pre2-real-status"><i></i> ${sample.realGallery ? 'Foto real' : 'Portada real'}</span>
    </div>
    <div class="pre2-real-body">
      <div class="pre2-real-copy">
        <small>${esc(category)}</small>
        <h3>${esc(description)}</h3>
        <p>Publicado por <strong>${esc(business.nombre)}</strong></p>
        <span>⌖ ${esc(locationText(business))}</span>
      </div>
    </div>
  </article>`;
}

async function loadRealSamples() {
  if (!grid) return;
  if (!supabase) {
    grid.innerHTML = '<p class="pre2-real-error">No pudimos consultar las muestras en este momento.</p>';
    return;
  }

  const { data, error } = await supabase
    .from('negocios')
    .select('id,nombre,descripcion_corta,descripcion,municipio,estado_region,portada_url,activo,categorias(nombre)')
    .eq('activo', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Aliados prelaunch:', error);
    grid.innerHTML = '<p class="pre2-real-error">No pudimos cargar las muestras ahora.</p>';
    return;
  }

  const businesses = data || [];
  const ids = businesses.map(item => item.id);
  let gallery = [];
  if (ids.length) {
    const galleryResult = await supabase
      .from('galeria_negocio')
      .select('negocio_id,imagen_url,orden')
      .in('negocio_id', ids)
      .order('orden');
    gallery = galleryResult.data || [];
  }

  const samples = buildSamples(businesses, gallery);
  if (!samples.length) {
    grid.innerHTML = '<p class="pre2-real-error">Las primeras muestras están terminando de prepararse.</p>';
    if (summary) summary.textContent = 'Las primeras fotografías están en preparación.';
    return;
  }

  grid.innerHTML = samples.slice(0, 6).map(cardMarkup).join('');
  if (summary) summary.textContent = `${samples.length} muestra${samples.length === 1 ? '' : 's'} real${samples.length === 1 ? '' : 'es'} ya publicada${samples.length === 1 ? '' : 's'}.`;
  if (proof) proof.textContent = `${samples.length} muestra${samples.length === 1 ? '' : 's'} real${samples.length === 1 ? '' : 'es'} lista${samples.length === 1 ? '' : 's'} antes del lanzamiento.`;

  grid.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => {
      if (!image.src.endsWith(DEFAULT_LOGO)) image.src = DEFAULT_LOGO;
    }, { once: true });
  });
}

loadRealSamples();
