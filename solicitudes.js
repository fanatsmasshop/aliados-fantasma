import { requireAdmin, logout } from './auth.js?v=20260717-2';
import { supabase } from './supabase-client.js?v=20260717-2';
import { shell, esc, fmt, toast, openModal, closeModal } from './ui.js?v=20260717-2';

let requests = [];
let current = null;
const auth = await requireAdmin();

if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#refresh-button').addEventListener('click', load);
  document.querySelector('#search').addEventListener('input', render);
  document.querySelector('#state-filter').addEventListener('change', render);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
  document.querySelector('#approve-button').addEventListener('click', () => decide('aprobada'));
  document.querySelector('#reject-button').addEventListener('click', () => decide('rechazada'));
  document.querySelector('#changes-button').addEventListener('click', () => decide('requiere_cambios'));
  await load();
}

async function load() {
  const { data, error } = await supabase.from('solicitudes_cambio').select('*,negocios(nombre)').order('created_at',{ascending:false});
  if (error) return toast(error.message, 'error');
  requests = data || [];
  render();
}

function render() {
  const term = document.querySelector('#search').value.toLowerCase();
  const state = document.querySelector('#state-filter').value;
  const filtered = requests.filter(item => (!term || [item.titulo,item.negocios?.nombre].some(value => (value || '').toLowerCase().includes(term))) && (!state || item.estado === state));
  document.querySelector('#request-body').innerHTML = filtered.length ? filtered.map(item => `
    <tr><td><strong>${esc(item.titulo)}</strong><small class="muted">${esc(item.motivo || 'Sin motivo')}</small></td><td>${esc(item.negocios?.nombre || 'Sin negocio')}</td><td>${esc(item.tipo_recurso)}</td><td><span class="badge ${item.estado}">${esc(item.estado.replaceAll('_',' '))}</span></td><td>${fmt(item.created_at)}</td><td><button class="button secondary small" type="button" onclick="reviewRequest('${item.id}')">Revisar</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">Sin solicitudes</td></tr>';
}

window.reviewRequest = (id) => {
  current = requests.find(item => item.id === id);
  if (!current) return;
  document.querySelector('#request-title').textContent = current.titulo;
  document.querySelector('#request-meta').innerHTML = `<strong>${esc(current.negocios?.nombre || 'Sin negocio')}</strong><small class="muted">${esc(current.tipo_recurso)} · ${fmt(current.created_at)} · ${esc(current.estado)}</small>`;
  document.querySelector('#current-data').textContent = JSON.stringify(current.datos_actuales || {}, null, 2);
  document.querySelector('#proposed-data').textContent = JSON.stringify(current.datos_propuestos || {}, null, 2);
  document.querySelector('#admin-comment').value = current.comentario_administrador || '';
  openModal('#request-modal');
};

async function decide(state) {
  if (!current) return;
  const comment = document.querySelector('#admin-comment').value.trim();
  if (state !== 'aprobada' && !comment) return toast('Escribe un comentario para esta decisión', 'error');

  const { error } = await supabase.from('solicitudes_cambio').update({estado:state,comentario_administrador:comment || null,revisado_por:auth.user.id,revisado_at:new Date().toISOString()}).eq('id',current.id);
  if (error) return toast(error.message, 'error');

  const { error: historyError } = await supabase.from('solicitud_historial').insert({solicitud_id:current.id,usuario_id:auth.user.id,estado_anterior:current.estado,estado_nuevo:state,comentario:comment || null});
  if (historyError) console.error(historyError);

  closeModal('#request-modal');
  toast(`Solicitud marcada como ${state.replaceAll('_',' ')}`);
  await load();
}
