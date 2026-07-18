import { supabase } from './supabase-client.js?v=20260718-100';
import { requireAdmin, logout } from './auth.js?v=20260718-100';
import { shell, esc, fmt, toast, setLoading } from './ui.js?v=20260718-100';

let rows = [];
let pendingAction = null;
const grid = document.querySelector('#pre-grid');
const warning = document.querySelector('#warning');
const search = document.querySelector('#search');
const filter = document.querySelector('#status-filter');
const refreshButton = document.querySelector('#refresh-button');
const modal = document.querySelector('#decision-modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const modalIcon = document.querySelector('#modal-icon');
const modalConfirm = document.querySelector('#modal-confirm');
const notesField = document.querySelector('#notes-field');
const notes = document.querySelector('#admin-notes');

function showError(message) {
  warning.textContent = message;
  warning.classList.remove('hidden');
}

async function load() {
  warning.classList.add('hidden');
  refreshButton.disabled = true;
  grid.innerHTML = '<div class="loading-card"><div class="spinner"></div><p>Cargando solicitudes…</p></div>';
  try {
    const { data, error } = await supabase.rpc('admin_listar_pre_registros');
    if (error) throw error;
    rows = data || [];
    updateStats();
    render();
  } catch (error) {
    console.error(error);
    showError(`No se pudieron cargar las solicitudes: ${error.message || 'error desconocido'}. Confirma que ejecutaste 040_panel_admin_v1.sql.`);
    grid.innerHTML = '<div class="empty-premium"><span>⚠</span><h3>No fue posible cargar las solicitudes</h3><p>Ejecuta el archivo SQL de la versión 1.0 y vuelve a intentar.</p></div>';
  } finally {
    refreshButton.disabled = false;
  }
}

function updateStats() {
  const count = (status) => rows.filter(row => row.estado === status).length;
  document.querySelector('#pending-count').textContent = count('pendiente');
  document.querySelector('#contacted-count').textContent = count('contactado');
  document.querySelector('#approved-count').textContent = count('aprobado');
  document.querySelector('#total-count').textContent = rows.length;
  const badge = document.querySelector('#nav-pending');
  const pending = count('pendiente');
  badge.textContent = pending;
  badge.classList.toggle('hidden', pending === 0);
}

function statusLabel(status) {
  return ({ pendiente: 'Pendiente', contactado: 'Contactado', aprobado: 'Aprobado', rechazado: 'Rechazado' })[status] || status;
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AF';
}

function render() {
  const term = search.value.trim().toLowerCase();
  const selectedStatus = filter.value;
  const visible = rows.filter(row => {
    const text = [row.nombre_negocio, row.nombre_responsable, row.correo, row.municipio, row.colonia, row.whatsapp, row.categoria].join(' ').toLowerCase();
    return (!selectedStatus || row.estado === selectedStatus) && (!term || text.includes(term));
  });

  if (!visible.length) {
    grid.innerHTML = `<div class="empty-premium"><span>◇</span><h3>No hay solicitudes aquí</h3><p>${rows.length ? 'Prueba otro filtro o término de búsqueda.' : 'Los nuevos registros verificados aparecerán automáticamente.'}</p></div>`;
    return;
  }

  grid.innerHTML = visible.map(row => `
    <article class="application-card" data-status="${esc(row.estado)}">
      <div class="application-top">
        <div class="business-avatar">${esc(initials(row.nombre_negocio))}</div>
        <div class="application-title"><div class="status-pill ${esc(row.estado)}"><i></i>${esc(statusLabel(row.estado))}</div><h3>${esc(row.nombre_negocio || 'Negocio sin nombre')}</h3><p>${esc(row.categoria || 'Categoría por definir')}</p></div>
        <button class="more-button" type="button" title="Identificador">•••</button>
      </div>
      <div class="completion"><div><span>Datos recibidos</span><strong>${row.correo_verificado ? '100%' : '80%'}</strong></div><div class="progress"><i style="width:${row.correo_verificado ? 100 : 80}%"></i></div></div>
      <dl class="application-data">
        <div><dt>Responsable</dt><dd>${esc(row.nombre_responsable || '—')}</dd></div>
        <div><dt>Correo</dt><dd><a href="mailto:${esc(row.correo || '')}">${esc(row.correo || '—')}</a>${row.correo_verificado ? '<em class="verified">✓ Verificado</em>' : '<em>Sin verificar</em>'}</dd></div>
        <div><dt>WhatsApp</dt><dd>${row.whatsapp ? `<a href="https://wa.me/52${esc(String(row.whatsapp).replace(/\D/g, '').replace(/^52/, ''))}" target="_blank" rel="noopener">${esc(row.whatsapp)}</a>` : '—'}</dd></div>
        <div><dt>Ubicación</dt><dd>${esc([row.colonia, row.municipio].filter(Boolean).join(', ') || '—')}</dd></div>
        <div><dt>Registro</dt><dd>${esc(fmt(row.created_at))}</dd></div>
        ${row.notas_admin ? `<div class="wide"><dt>Notas internas</dt><dd>${esc(row.notas_admin)}</dd></div>` : ''}
      </dl>
      <div class="application-actions">
        ${row.estado === 'aprobado' ? `<a class="button secondary" href="negocios.html">Ver negocios</a><span class="approved-message">✓ Cuenta activada</span>` : `
          <button class="button secondary action-contact" data-id="${row.id}" type="button">Contactado</button>
          <button class="button danger-soft action-reject" data-id="${row.id}" type="button">Rechazar</button>
          <button class="button primary action-approve" data-id="${row.id}" type="button" ${row.correo_verificado ? '' : 'disabled'}>✓ Aprobar y crear negocio</button>
        `}
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('.action-approve').forEach(button => button.addEventListener('click', () => openDecision('approve', button.dataset.id)));
  grid.querySelectorAll('.action-contact').forEach(button => button.addEventListener('click', () => openDecision('contact', button.dataset.id)));
  grid.querySelectorAll('.action-reject').forEach(button => button.addEventListener('click', () => openDecision('reject', button.dataset.id)));
}

function openDecision(type, id) {
  const row = rows.find(item => item.id === id);
  if (!row) return;
  pendingAction = { type, id, row };
  notes.value = row.notas_admin || '';
  notesField.classList.toggle('hidden', type === 'approve');
  modalConfirm.className = `button ${type === 'reject' ? 'danger' : 'primary'}`;
  if (type === 'approve') {
    modalIcon.textContent = '✓';
    modalTitle.textContent = 'Aprobar y activar negocio';
    modalDescription.textContent = `Se creará el negocio “${row.nombre_negocio}”, se activará la cuenta de ${row.nombre_responsable} y se asignará como propietario.`;
    modalConfirm.textContent = 'Sí, aprobar negocio';
  } else if (type === 'contact') {
    modalIcon.textContent = '✉';
    modalTitle.textContent = 'Marcar como contactado';
    modalDescription.textContent = `La solicitud de “${row.nombre_negocio}” pasará a seguimiento.`;
    modalConfirm.textContent = 'Guardar seguimiento';
  } else {
    modalIcon.textContent = '×';
    modalTitle.textContent = 'Rechazar solicitud';
    modalDescription.textContent = `La cuenta de “${row.nombre_negocio}” no tendrá acceso al panel. Puedes guardar un motivo interno.`;
    modalConfirm.textContent = 'Rechazar solicitud';
  }
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeDecision() {
  modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  pendingAction = null;
}

async function confirmDecision() {
  if (!pendingAction) return;
  setLoading(modalConfirm, true, 'Procesando…');
  try {
    if (pendingAction.type === 'approve') {
      const { error } = await supabase.rpc('admin_aprobar_pre_registro', { p_id: pendingAction.id });
      if (error) throw error;
      toast('Negocio aprobado, cuenta activada y propietario asignado.');
    } else {
      const estado = pendingAction.type === 'contact' ? 'contactado' : 'rechazado';
      const { error } = await supabase.rpc('admin_cambiar_estado_pre_registro', { p_id: pendingAction.id, p_estado: estado, p_notas: notes.value.trim() || null });
      if (error) throw error;
      toast(estado === 'contactado' ? 'Solicitud marcada como contactada.' : 'Solicitud rechazada.', estado === 'rechazado' ? 'error' : 'success');
    }
    closeDecision();
    await load();
  } catch (error) {
    console.error(error);
    toast(error.message || 'No fue posible completar la acción.', 'error');
  } finally {
    setLoading(modalConfirm, false);
  }
}

search.addEventListener('input', render);
filter.addEventListener('change', render);
refreshButton.addEventListener('click', load);
document.querySelector('#modal-close').addEventListener('click', closeDecision);
document.querySelector('#modal-cancel').addEventListener('click', closeDecision);
modalConfirm.addEventListener('click', confirmDecision);
modal.addEventListener('click', event => { if (event.target === modal) closeDecision(); });

const auth = await requireAdmin();
if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button')?.addEventListener('click', logout);
  await load();
}
