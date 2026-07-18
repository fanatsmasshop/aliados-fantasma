import { requireAdmin, logout } from './auth.js?v=20260718-120';
import { supabase } from './supabase-client.js?v=20260718-120';
import { shell, esc, fmt } from './ui.js?v=20260718-120';

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
    const [{ data: summary, error: summaryError }, { data: recent, error: recentError }] = await Promise.all([
      supabase.rpc('admin_resumen_pre_registro'),
      supabase.rpc('admin_listar_pre_registros')
    ]);
    if (summaryError) throw summaryError;
    if (recentError) throw recentError;

    document.querySelector('#pre-count').textContent = summary.pendientes ?? 0;
    document.querySelector('#contacted-count').textContent = summary.contactados ?? 0;
    document.querySelector('#approved-count').textContent = summary.aprobados ?? 0;
    document.querySelector('#total-count').textContent = summary.total ?? 0;

    const items = (recent || []).slice(0, 8);
    document.querySelector('#requests-list').innerHTML = items.length
      ? items.map(item => `<a class="detail-card" href="pre-registros.html"><strong>${esc(item.nombre_negocio)}</strong><small class="muted">${esc(item.nombre_responsable)} · ${esc(item.estado)} · ${fmt(item.created_at)}</small></a>`).join('')
      : '<div class="empty-state">Todavía no hay pre-registros</div>';
  } catch (error) {
    console.error(error);
    warning.textContent = `No se pudieron consultar los datos: ${error.message || 'error desconocido'}. Ejecuta 050_pre_registro_oficial.sql.`;
    warning.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}
