import { requireAdmin, logout } from './auth.js?v=20260718-100';
import { supabase } from './supabase-client.js?v=20260718-100';
import { shell, esc, fmt } from './ui.js?v=20260718-100';

const auth = await requireAdmin();
if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#refresh-button').addEventListener('click', load);
  await load();
}

async function load() {
  const button = document.querySelector('#refresh-button');
  const warning = document.querySelector('#warning');
  button.disabled = true;
  warning.classList.add('hidden');
  try {
    const { data: summary, error: summaryError } = await supabase.rpc('admin_resumen_panel');
    if (summaryError) throw summaryError;
    document.querySelector('#business-count').textContent = summary.negocios_total ?? 0;
    document.querySelector('#active-business-count').textContent = `${summary.negocios_activos ?? 0} activos`;
    document.querySelector('#pre-count').textContent = summary.pre_registros_pendientes ?? 0;
    document.querySelector('#request-count').textContent = summary.solicitudes_pendientes ?? 0;
    document.querySelector('#promotion-count').textContent = summary.promociones_activas ?? 0;

    const [{ data: recentPre, error: preError }, { data: recentBusinesses, error: businessError }] = await Promise.all([
      supabase.rpc('admin_listar_pre_registros'),
      supabase.from('negocios').select('nombre,activo,estado,created_at').order('created_at',{ascending:false}).limit(5)
    ]);
    if (preError) throw preError;
    if (businessError) throw businessError;
    const pending = (recentPre || []).filter(item => item.estado === 'pendiente').slice(0, 5);
    document.querySelector('#requests-list').innerHTML = pending.length
      ? pending.map(item => `<a class="detail-card" href="pre-registros.html"><strong>${esc(item.nombre_negocio)}</strong><small class="muted">${esc(item.nombre_responsable)} · ${fmt(item.created_at)}</small></a>`).join('')
      : '<div class="empty-state">Sin nuevos pre-registros</div>';
    document.querySelector('#business-list').innerHTML = recentBusinesses?.length
      ? recentBusinesses.map(item => `<div class="detail-card"><strong>${esc(item.nombre)}</strong><small class="muted">${esc(item.estado || (item.activo ? 'activo' : 'borrador'))} · ${fmt(item.created_at)}</small></div>`).join('')
      : '<div class="empty-state">Sin negocios</div>';
  } catch (error) {
    console.error(error);
    warning.textContent = `No se pudieron consultar los datos: ${error.message || 'error desconocido'}. Ejecuta 040_panel_admin_v1.sql.`;
    warning.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}
