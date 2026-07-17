import { requireAdmin, logout } from './auth.js?v=20260717-1';
import { supabase } from './supabase-client.js?v=20260717-1';
import { shell, esc, fmt } from './ui.js?v=20260717-1';

const auth = await requireAdmin();
if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#refresh-button').addEventListener('click', load);
  await load();
}

function withTimeout(promise, label, milliseconds = 15000) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tiempo de espera agotado al consultar ${label}`)), milliseconds);
    })
  ]);
}

async function count(table, filter) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) query = query.eq(filter[0], filter[1]);
  const { count: result, error } = await withTimeout(query, table);
  if (error) throw error;
  return result || 0;
}

async function load() {
  const button = document.querySelector('#refresh-button');
  const warning = document.querySelector('#warning');
  button.disabled = true;
  warning.classList.add('hidden');

  try {
    const [businesses, active, requests, promotions, categories] = await Promise.all([
      count('negocios'), count('negocios', ['activo', true]),
      count('solicitudes_cambio', ['estado', 'pendiente']),
      count('promociones', ['activa', true]), count('categorias')
    ]);

    document.querySelector('#business-count').textContent = businesses;
    document.querySelector('#active-business-count').textContent = `${active} activos`;
    document.querySelector('#request-count').textContent = requests;
    document.querySelector('#promotion-count').textContent = promotions;
    document.querySelector('#category-count').textContent = categories;

    const [{ data: recentRequests, error: requestError }, { data: recentBusinesses, error: businessError }] = await Promise.all([
      withTimeout(
        supabase.from('solicitudes_cambio').select('titulo,created_at,negocios(nombre)').order('created_at',{ascending:false}).limit(5),
        'solicitudes recientes'
      ),
      withTimeout(
        supabase.from('negocios').select('nombre,activo,created_at').order('created_at',{ascending:false}).limit(5),
        'negocios recientes'
      )
    ]);
    if (requestError) throw requestError;
    if (businessError) throw businessError;

    document.querySelector('#requests-list').innerHTML = recentRequests?.length
      ? recentRequests.map(item => `<div class="detail-card"><strong>${esc(item.titulo)}</strong><small class="muted">${esc(item.negocios?.nombre || 'Negocio')} · ${fmt(item.created_at)}</small></div>`).join('')
      : '<div class="empty-state">Sin solicitudes</div>';

    document.querySelector('#business-list').innerHTML = recentBusinesses?.length
      ? recentBusinesses.map(item => `<div class="detail-card"><strong>${esc(item.nombre)}</strong><small class="muted">${item.activo ? 'Activo' : 'Inactivo'} · ${fmt(item.created_at)}</small></div>`).join('')
      : '<div class="empty-state">Sin negocios</div>';
  } catch (error) {
    console.error('Error de Dashboard:', error);
    warning.textContent = `No se pudieron consultar los datos: ${error.message || 'error desconocido'}`;
    warning.classList.remove('hidden');
    document.querySelector('#requests-list').innerHTML =
      '<div class="empty-state">No se pudieron cargar las solicitudes.</div>';
    document.querySelector('#business-list').innerHTML =
      '<div class="empty-state">No se pudieron cargar los negocios.</div>';
  } finally {
    button.disabled = false;
  }
}
