import { supabase } from './supabase-client.js?v=20260717-2';
import { esc } from './ui.js?v=20260717-2';

const slug = new URLSearchParams(location.search).get('slug');
const root = document.querySelector('#profile-root');

if (!supabase) {
  showMessage('La conexión con Supabase no está disponible.');
} else if (!slug) {
  showMessage(
    'No se indicó qué negocio mostrar.',
    '<a class="button secondary" href="index.html#negocios">Volver a negocios</a>'
  );
} else {
  await loadProfile();
}

async function loadProfile() {
  const { data: business, error } = await supabase
    .from('negocios')
    .select('*, categorias(nombre)')
    .eq('slug', slug)
    .eq('activo', true)
    .maybeSingle();

  if (error) {
    console.error('Error al cargar el negocio:', error);
    showMessage(`No fue posible cargar el perfil: ${esc(error.message)}`);
    return;
  }

  if (!business) {
    showMessage(
      'Perfil no disponible.',
      '<a class="button secondary" href="index.html#negocios">Explorar otros negocios</a>'
    );
    return;
  }

  const [
    { data: promotions, error: promotionsError },
    { data: networks, error: networksError },
    { data: schedules, error: schedulesError }
  ] = await Promise.all([
    supabase
      .from('promociones')
      .select('*')
      .eq('negocio_id', business.id)
      .eq('activa', true)
      .order('destacada', { ascending: false }),
    supabase
      .from('redes_sociales')
      .select('*')
      .eq('negocio_id', business.id)
      .eq('activa', true)
      .order('orden'),
    supabase
      .from('horarios_negocio')
      .select('*')
      .eq('negocio_id', business.id)
      .order('dia_semana')
  ]);

  if (promotionsError) console.warn('Promociones:', promotionsError);
  if (networksError) console.warn('Redes:', networksError);
  if (schedulesError) console.warn('Horarios:', schedulesError);

  document.title = `${business.nombre} | Aliados Fantasma`;

  root.innerHTML = `
    <section id="profile-cover" class="profile-cover ${business.portada_url ? 'has-cover' : ''}">
      <div class="profile-cover-overlay"></div>

      <div class="profile-identity">
        <div class="profile-logo">
          ${business.logo_url
            ? `<img src="${esc(business.logo_url)}" alt="Logo de ${esc(business.nombre)}">`
            : `<span>${esc(business.nombre.charAt(0))}</span>`}
        </div>

        <div class="profile-identity-text">
          <p class="eyebrow">${esc(business.categorias?.nombre || 'NEGOCIO ALIADO')}</p>
          <h1>${esc(business.nombre)}</h1>
          <p>${esc(business.descripcion_corta || '')}</p>

          <div class="profile-quick-actions">
            ${business.whatsapp
              ? `<a class="button primary" href="https://wa.me/${business.whatsapp.replace(/\D/g, '')}" target="_blank" rel="noopener">WhatsApp</a>`
              : ''}
            ${business.enlace_maps
              ? `<a class="button secondary" href="${esc(business.enlace_maps)}" target="_blank" rel="noopener">Cómo llegar</a>`
              : ''}
          </div>
        </div>
      </div>
    </section>

    <main class="profile-content">
      <div class="profile-grid">
        <article class="panel profile-main-panel">
          <section class="profile-section">
            <p class="eyebrow">SOBRE EL NEGOCIO</p>
            <h2>Conoce el negocio</h2>
            <p class="muted profile-description">
              ${esc(business.descripcion || business.descripcion_corta || 'Sin descripción disponible.')}
            </p>
          </section>

          <section class="profile-section">
            <div class="profile-section-heading">
              <div>
                <p class="eyebrow">OFERTAS</p>
                <h2>Promociones</h2>
              </div>
            </div>

            <div class="promotion-grid">
              ${promotions?.length
                ? promotions.map(renderPromotion).join('')
                : '<div class="empty-profile-card">Sin promociones activas.</div>'}
            </div>
          </section>
        </article>

        <aside class="panel profile-info-panel">
          <p class="eyebrow">INFORMACIÓN ÚTIL</p>
          <h2>Información</h2>

          <div class="profile-info-list">
            <div class="detail-card">
              <small>Dirección</small>
              <strong>${esc(
                [business.direccion, business.colonia, business.municipio]
                  .filter(Boolean)
                  .join(', ') || 'No disponible'
              )}</strong>
            </div>

            ${business.telefono
              ? `<div class="detail-card"><small>Teléfono</small><strong>${esc(business.telefono)}</strong></div>`
              : ''}

            ${business.correo
              ? `<div class="detail-card"><small>Correo</small><strong>${esc(business.correo)}</strong></div>`
              : ''}
          </div>

          <section class="profile-side-section">
            <h3>Redes</h3>
            <div class="profile-links">
              ${networks?.length
                ? networks.map(item => `
                    <a class="detail-card profile-link" href="${esc(item.url)}" target="_blank" rel="noopener">
                      <span>${esc(item.plataforma)}</span>
                      <strong>↗</strong>
                    </a>
                  `).join('')
                : '<p class="muted">Sin redes registradas.</p>'}
            </div>
          </section>

          <section class="profile-side-section">
            <h3>Horarios</h3>
            <div class="schedule-list">
              ${schedules?.length
                ? schedules.map(renderSchedule).join('')
                : '<p class="muted">Sin horarios registrados.</p>'}
            </div>
          </section>
        </aside>
      </div>
    </main>
  `;

  const cover = document.querySelector('#profile-cover');

  if (business.portada_url) {
    cover.style.backgroundImage = `url("${cssUrl(business.portada_url)}")`;
  }

  if (business.color_primario) {
    document.documentElement.style.setProperty('--business-primary', business.color_primario);
  }

  if (business.color_secundario) {
    document.documentElement.style.setProperty('--business-secondary', business.color_secundario);
  }
}

function renderPromotion(item) {
  return `
    <article class="promotion-card">
      ${item.imagen_url
        ? `<img src="${esc(item.imagen_url)}" alt="${esc(item.titulo)}">`
        : ''}
      <div>
        <strong>${esc(item.titulo)}</strong>
        <p>${esc(item.descripcion || '')}</p>
      </div>
    </article>
  `;
}

function renderSchedule(item) {
  return `
    <div class="schedule-row">
      <span>${dayName(item.dia_semana)}</span>
      <strong>${item.cerrado
        ? 'Cerrado'
        : `${formatTime(item.hora_apertura)} – ${formatTime(item.hora_cierre)}`}</strong>
    </div>
  `;
}

function dayName(day) {
  const names = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado'
  ];

  return names[Number(day)] || `Día ${day}`;
}

function formatTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

function cssUrl(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n|\r/g, '');
}

function showMessage(message, action = '') {
  root.innerHTML = `
    <div class="profile-error-state">
      <strong>${message}</strong>
      ${action}
    </div>
  `;
}
