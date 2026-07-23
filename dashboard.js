import { requireAdmin, logout } from './auth.js?v=20260718-120';
import { supabase } from './supabase-client.js?v=20260718-120';
import { shell, esc, fmt } from './ui.js?v=20260720-600';
import { getLaunchState, clearLaunchStateCache, LAUNCH_LABEL } from './launch-control.js?v=20260723-900';

const auth = await requireAdmin();
if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#refresh-button').addEventListener('click', load);
  document.querySelector('#save-launch-mode').addEventListener('click', saveLaunchMode);
  await Promise.all([load(), loadLaunchControl()]);
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


async function loadLaunchControl() {
  const badge = document.querySelector('#launch-control-badge');
  const description = document.querySelector('#launch-control-description');
  try {
    clearLaunchStateCache();
    const state = await getLaunchState({ refresh: true });
    document.querySelector('#launch-mode').value = state.mode;
    badge.textContent = state.open ? 'Público abierto' : 'Público en espera';
    badge.className = `status-pill ${state.open ? 'ok' : 'pending'}`;
    const modeText = state.mode === 'automatico' ? `Automático: se abrirá el ${LAUNCH_LABEL}.` : state.mode === 'cerrado' ? 'Cierre manual activo: la fecha no abrirá el sitio hasta cambiar el modo.' : 'Apertura manual activa: el directorio y los perfiles públicos están disponibles.';
    description.textContent = modeText;
  } catch (error) {
    console.error(error);
    badge.textContent = 'Sin configuración';
    badge.className = 'status-pill pending';
    description.textContent = 'Ejecuta 063_control_global_lanzamiento.sql para activar el control global.';
  }
}

async function saveLaunchMode() {
  const button = document.querySelector('#save-launch-mode');
  const message = document.querySelector('#launch-control-message');
  const mode = document.querySelector('#launch-mode').value;
  const warning = mode === 'abierto'
    ? 'Esto habilitará inmediatamente el directorio y los perfiles públicos. ¿Continuar?'
    : mode === 'cerrado'
      ? 'Esto mantendrá cerrado el acceso público incluso después de la fecha programada. ¿Continuar?'
      : 'El sitio volverá al modo automático según la fecha programada. ¿Continuar?';
  if (!confirm(warning)) return;
  button.disabled = true;
  message.textContent = 'Guardando…';
  try {
    const { error } = await supabase.rpc('admin_actualizar_modo_lanzamiento', { p_modo: mode });
    if (error) throw error;
    clearLaunchStateCache();
    message.style.color = 'var(--success)';
    message.textContent = 'Modo de lanzamiento actualizado correctamente.';
    await loadLaunchControl();
  } catch (error) {
    console.error(error);
    message.style.color = 'var(--danger)';
    message.textContent = error.message || 'No fue posible actualizar el modo.';
  } finally {
    button.disabled = false;
  }
}
