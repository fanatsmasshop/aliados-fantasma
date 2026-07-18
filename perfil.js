import { supabase } from './supabase-client.js?v=20260717-2';
import { esc } from './ui.js?v=20260717-2';

const slug = new URLSearchParams(location.search).get('slug');
const root = document.querySelector('#profile-root');

if (!supabase) {
  root.innerHTML = '<div class="empty-state">La conexión con Supabase no está disponible.</div>';
} else if (!slug) {
  root.innerHTML = '<div class="empty-state">No se indicó qué negocio mostrar. <a class="button secondary" href="index.html#negocios">Volver a negocios</a></div>';
} else {
  const { data: business, error } = await supabase.from('negocios').select('*,categorias(nombre)').eq('slug',slug).eq('activo',true).maybeSingle();

  if (error) {
    console.error(error);
    root.innerHTML = `<div class="empty-state">No fue posible cargar el perfil: ${esc(error.message)}</div>`;
  } else if (!business) {
    root.innerHTML = '<div class="empty-state">Perfil no disponible. <a class="button secondary" href="index.html#negocios">Explorar otros negocios</a></div>';
  } else {
    const [{ data: promotions }, { data: networks }, { data: schedules }] = await Promise.all([
      supabase.from('promociones').select('*').eq('negocio_id',business.id).eq('activa',true),
      supabase.from('redes_sociales').select('*').eq('negocio_id',business.id).eq('activa',true),
      supabase.from('horarios_negocio').select('*').eq('negocio_id',business.id).order('dia_semana')
    ]);

    document.title = `${business.nombre} | Aliados Fantasma`;
    root.innerHTML = `
      <section class="profile-hero">
        <div class="profile-logo">${business.logo_url ? `<img src="${esc(business.logo_url)}" alt="Logo de ${esc(business.nombre)}">` : esc(business.nombre.charAt(0))}</div>
        <p class="eyebrow">${esc(business.categorias?.nombre || 'NEGOCIO ALIADO')}</p>
        <h1>${esc(business.nombre)}</h1><p>${esc(business.descripcion_corta || '')}</p>
      </section>
      <main class="profile-content"><div class="profile-grid">
        <article class="panel"><h2>Conoce el negocio</h2><p class="muted">${esc(business.descripcion || business.descripcion_corta || 'Sin descripción disponible.')}</p>
          <div class="actions" style="justify-content:flex-start">${business.whatsapp ? `<a class="button primary" href="https://wa.me/${business.whatsapp.replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${business.enlace_maps ? `<a class="button secondary" href="${esc(business.enlace_maps)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}</div>
          <h3>Promociones</h3>${promotions?.length ? promotions.map(item => `<div class="detail-card"><strong>${esc(item.titulo)}</strong><p class="muted">${esc(item.descripcion || '')}</p></div>`).join('') : '<p class="muted">Sin promociones activas.</p>'}
        </article>
        <aside class="panel"><h2>Información</h2><div class="detail-card"><small>Dirección</small><strong>${esc([business.direccion,business.colonia,business.municipio].filter(Boolean).join(', ') || 'No disponible')}</strong></div>
          <h3>Redes</h3>${networks?.length ? networks.map(item => `<a class="detail-card" style="display:block" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.plataforma)}</a>`).join('') : '<p class="muted">Sin redes registradas.</p>'}
          <h3>Horarios</h3>${schedules?.length ? schedules.map(item => `<div class="detail-card"><small>Día ${item.dia_semana}</small><strong>${item.cerrado ? 'Cerrado' : `${item.hora_apertura} - ${item.hora_cierre}`}</strong></div>`).join('') : '<p class="muted">Sin horarios registrados.</p>'}
        </aside>
      </div></main>`;
  }
}
