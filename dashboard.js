import { requireAdmin, logout } from './auth.js?v=20260718-120';
import { supabase } from './supabase-client.js?v=20260718-120';
import { shell, esc, fmt } from './ui.js?v=20260828-ADMIN3';
import {
  getLaunchState,
  clearLaunchStateCache,
  toMexicoCityInputValue,
  mexicoCityInputToIso
} from './launch-control.js?v=20260730-CINEMA2';

const auth = await requireAdmin();
if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#refresh-button').addEventListener('click', load);
  document.querySelector('#save-launch-settings').addEventListener('click', saveLaunchSettings);
  document.querySelector('#launch-date-pending').addEventListener('change', syncLaunchDateField);
  document.querySelector('#save-presentation-settings').addEventListener('click', savePresentationSettings);
  await Promise.all([load(), loadLaunchControl(), loadPresentationControl()]);
}

async function load() {
  const button = document.querySelector('#refresh-button');
  const warning = document.querySelector('#warning');
  button.disabled = true;
  warning.classList.add('hidden');
  try {
    const [{ data: summary, error: summaryError }, { data: recent, error: recentError }, {data: panelSummary, error: panelError}] = await Promise.all([
      supabase.rpc('admin_resumen_pre_registro'),
      supabase.rpc('admin_listar_pre_registros'),
      supabase.rpc('admin_resumen_panel')
    ]);
    if (summaryError) throw summaryError;
    if (recentError) throw recentError;
    if (panelError) throw panelError;

    document.querySelector('#pre-count').textContent = summary.pendientes ?? 0;
    document.querySelector('#contacted-count').textContent = summary.verificados ?? 0;
    document.querySelector('#approved-count').textContent = panelSummary?.solicitudes_pendientes ?? 0;
    document.querySelector('#total-count').textContent = summary.total ?? 0;

    const items = (recent || []).slice(0, 8);
    document.querySelector('#requests-list').innerHTML = items.length
      ? items.map(item => {
          const business = item.nombre_negocio || 'Negocio sin nombre';
          const owner = item.nombre_responsable || 'Responsable no indicado';
          const status = item.correo_verificado ? 'verificado' : 'pendiente';
          const initial = business.trim().charAt(0).toUpperCase() || 'N';
          return `<a class="recent-request" href="pre-registros.html">
            <span class="recent-avatar">${esc(initial)}</span>
            <span class="recent-info"><strong>${esc(business)}</strong><small>${esc(owner)}</small></span>
            <span class="recent-meta"><span class="recent-status ${esc(status)}">${esc(status.replaceAll('_', ' '))}</span><span class="recent-date">${fmt(item.created_at)}</span></span>
          </a>`;
        }).join('')
      : '<div class="dashboard-empty"><span>✉</span><h3>Sin registros todavía</h3><p>Las nuevas cuentas aparecerán aquí.</p></div>';
  } catch (error) {
    console.error(error);
    warning.textContent = `No se pudieron consultar los datos: ${error.message || 'error desconocido'}. Ejecuta 050_pre_registro_oficial.sql.`;
    warning.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}


function syncLaunchDateField() {
  const pending = document.querySelector('#launch-date-pending').checked;
  const input = document.querySelector('#launch-at');
  input.disabled = pending;
  input.required = !pending;
}

async function loadLaunchControl() {
  const badge = document.querySelector('#launch-control-badge');
  const description = document.querySelector('#launch-control-description');
  const dateLabel = document.querySelector('#launch-current-date');

  try {
    clearLaunchStateCache();
    const state = await getLaunchState({ refresh: true });
    document.querySelector('#launch-mode').value = state.mode;
    document.querySelector('#launch-at').value = toMexicoCityInputValue(state.launchAtIso);
    document.querySelector('#launch-date-pending').checked = !state.hasDate;
    syncLaunchDateField();

    badge.textContent = state.open ? 'Público abierto' : state.hasDate ? 'Público programado' : 'Fecha pendiente';
    badge.className = `status-pill ${state.open ? 'ok' : 'pending'}`;
    dateLabel.textContent = state.hasDate ? state.launchLabel : 'Fecha por confirmar';

    if (state.mode === 'automatico') {
      description.textContent = state.hasDate
        ? `Apertura automática programada para ${state.launchLabel}.`
        : 'El modo automático necesita una fecha. Mientras no se establezca, el acceso público permanecerá cerrado.';
    } else if (state.mode === 'cerrado') {
      description.textContent = state.hasDate
        ? `Cierre manual activo. La fecha guardada es ${state.launchLabel}, pero el sitio no abrirá hasta cambiar el modo.`
        : 'Cierre manual activo y fecha todavía por confirmar.';
    } else {
      description.textContent = state.hasDate
        ? `Apertura manual activa. La fecha informativa guardada es ${state.launchLabel}.`
        : 'Apertura manual activa sin una fecha oficial anunciada.';
    }
  } catch (error) {
    console.error(error);
    badge.textContent = 'Sin configuración';
    badge.className = 'status-pill pending';
    description.textContent = 'Ejecuta AF_130_FECHA_LANZAMIENTO_DINAMICA.sql para activar el control editable.';
    dateLabel.textContent = 'No disponible';
  }
}

async function saveLaunchSettings() {
  const button = document.querySelector('#save-launch-settings');
  const message = document.querySelector('#launch-control-message');
  const mode = document.querySelector('#launch-mode').value;
  const pending = document.querySelector('#launch-date-pending').checked;
  const localValue = document.querySelector('#launch-at').value;

  if (!pending && !localValue) {
    message.style.color = 'var(--danger)';
    message.textContent = 'Selecciona la fecha y hora o marca “Fecha aún por confirmar”.';
    return;
  }

  if (pending && mode === 'automatico') {
    message.style.color = 'var(--danger)';
    message.textContent = 'El modo automático requiere una fecha. Selecciona “Mantener cerrado manualmente” mientras se confirma.';
    return;
  }

  const launchAtIso = pending ? null : mexicoCityInputToIso(localValue);
  if (!pending && !launchAtIso) {
    message.style.color = 'var(--danger)';
    message.textContent = 'La fecha seleccionada no es válida.';
    return;
  }

  const readableDate = pending
    ? 'la fecha como pendiente'
    : `la fecha ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(launchAtIso))}`;

  const warning = mode === 'abierto'
    ? `Esto habilitará inmediatamente el directorio y los perfiles públicos y guardará ${readableDate}. ¿Continuar?`
    : mode === 'cerrado'
      ? `Esto mantendrá cerrado el acceso público y guardará ${readableDate}. ¿Continuar?`
      : `El sitio se abrirá automáticamente en ${readableDate}. ¿Continuar?`;

  if (!confirm(warning)) return;

  button.disabled = true;
  message.style.color = 'var(--muted)';
  message.textContent = 'Guardando configuración…';

  try {
    const { error } = await supabase.rpc('admin_actualizar_configuracion_lanzamiento', {
      p_modo: mode,
      p_lanzamiento_at: launchAtIso
    });
    if (error) throw error;

    clearLaunchStateCache();
    message.style.color = 'var(--success)';
    message.textContent = pending
      ? 'Fecha retirada correctamente. Toda la plataforma mostrará “Fecha por confirmar”.'
      : 'Fecha y modo de lanzamiento actualizados en toda la plataforma.';
    await loadLaunchControl();
  } catch (error) {
    console.error(error);
    message.style.color = 'var(--danger)';
    message.textContent = error.message?.includes('admin_actualizar_configuracion_lanzamiento')
      ? 'Primero ejecuta AF_130_FECHA_LANZAMIENTO_DINAMICA.sql en Supabase.'
      : error.message || 'No fue posible actualizar la configuración.';
  } finally {
    button.disabled = false;
  }
}



function presentationModeLabel(mode) {
  if (mode === 'evento') return 'Evento cinematográfico · 28 segundos';
  if (mode === 'ninguna') return 'Sin presentación';
  return 'Presentación breve · 8 segundos';
}

function presentationFrequencyLabel(frequency) {
  if (frequency === 'solo_lanzamiento') return 'solo al abrirse oficialmente';
  if (frequency === 'cada_entrada') return 'en cada entrada';
  return 'una vez por visitante';
}

async function loadPresentationControl() {
  const badge = document.querySelector('#presentation-control-badge');
  const description = document.querySelector('#presentation-control-description');

  try {
    clearLaunchStateCache();
    const state = await getLaunchState({ refresh: true });
    document.querySelector('#presentation-mode').value = state.presentationMode;
    document.querySelector('#presentation-frequency').value = state.presentationFrequency;
    document.querySelector('#presentation-target').value = state.presentationTarget;
    document.querySelector('#presentation-reset').checked = false;

    badge.textContent = state.presentationMode === 'evento'
      ? 'Evento 28 s'
      : state.presentationMode === 'breve'
        ? 'Breve 8 s'
        : 'Desactivada';
    badge.className = `status-pill ${state.presentationMode === 'ninguna' ? 'pending' : 'ok'}`;

    description.textContent = `${presentationModeLabel(state.presentationMode)}, ${presentationFrequencyLabel(state.presentationFrequency)}. Al terminar ${state.presentationTarget === 'directorio' ? 'abrirá el directorio completo' : 'revelará el inicio con banners y negocios'}.`;
  } catch (error) {
    console.error(error);
    badge.textContent = 'Sin configuración';
    badge.className = 'status-pill pending';
    description.textContent = 'Ejecuta AF_131_PRESENTACION_LANZAMIENTO.sql para activar este control.';
  }
}

async function savePresentationSettings() {
  const button = document.querySelector('#save-presentation-settings');
  const message = document.querySelector('#presentation-control-message');
  const mode = document.querySelector('#presentation-mode').value;
  const frequency = document.querySelector('#presentation-frequency').value;
  const target = document.querySelector('#presentation-target').value;
  const reset = document.querySelector('#presentation-reset').checked;

  const warning = mode === 'evento' && frequency === 'cada_entrada'
    ? 'La presentación cinematográfica dura 28 segundos y se mostrará en cada visita. Esto puede ser pesado después del evento. ¿Guardar de todos modos?'
    : `Se configurará “${presentationModeLabel(mode)}” ${presentationFrequencyLabel(frequency)}. ¿Continuar?`;

  if (!confirm(warning)) return;

  button.disabled = true;
  message.style.color = 'var(--muted)';
  message.textContent = 'Guardando presentación…';

  try {
    const { error } = await supabase.rpc('admin_actualizar_presentacion_lanzamiento', {
      p_modo: mode,
      p_frecuencia: frequency,
      p_destino: target,
      p_reiniciar: reset
    });
    if (error) throw error;

    clearLaunchStateCache();
    message.style.color = 'var(--success)';
    message.textContent = reset
      ? 'Presentación guardada y reiniciada para los visitantes.'
      : 'Presentación de lanzamiento actualizada correctamente.';
    await loadPresentationControl();
  } catch (error) {
    console.error(error);
    message.style.color = 'var(--danger)';
    message.textContent = error.message?.includes('admin_actualizar_presentacion_lanzamiento')
      ? 'Primero ejecuta AF_131_PRESENTACION_LANZAMIENTO.sql en Supabase.'
      : error.message || 'No fue posible actualizar la presentación.';
  } finally {
    button.disabled = false;
  }
}
