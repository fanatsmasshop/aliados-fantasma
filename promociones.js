import { requireAdmin, logout } from './auth.js?v=20260717-2';
import { supabase } from './supabase-client.js?v=20260717-2';
import { shell, esc, fmt, toast, openModal, closeModal, setLoading } from './ui.js?v=20260717-2';

let promotions = [];
const auth = await requireAdmin();

if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#new-promotion').addEventListener('click', newPromotion);
  document.querySelector('#promotion-form').addEventListener('submit', savePromotion);
  document.querySelector('#search').addEventListener('input', render);
  document.querySelector('#status-filter').addEventListener('change', render);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
  await loadBusinesses();
  await loadPromotions();
}

async function loadBusinesses() {
  const { data, error } = await supabase.from('negocios').select('id,nombre').order('nombre');
  if (error) return toast(error.message, 'error');
  document.querySelector('#promotion-business').innerHTML = '<option value="">Selecciona un negocio</option>' + (data || []).map(item => `<option value="${item.id}">${esc(item.nombre)}</option>`).join('');
}

async function loadPromotions() {
  const { data, error } = await supabase.from('promociones').select('*,negocios(nombre)').order('created_at',{ascending:false});
  if (error) return toast(error.message, 'error');
  promotions = data || [];
  render();
}

function render() {
  const term = document.querySelector('#search').value.toLowerCase();
  const status = document.querySelector('#status-filter').value;
  const filtered = promotions.filter(item => (!term || [item.titulo,item.negocios?.nombre].some(value => (value || '').toLowerCase().includes(term))) && (!status || (status === 'active' ? item.activa : !item.activa)));
  document.querySelector('#promotion-body').innerHTML = filtered.length ? filtered.map(item => `
    <tr><td><strong>${esc(item.titulo)}</strong><small class="muted">${esc(item.descripcion || '')}</small></td><td>${esc(item.negocios?.nombre || 'Sin negocio')}</td><td>${item.fecha_inicio ? fmt(item.fecha_inicio) : 'Sin inicio'} → ${item.fecha_fin ? fmt(item.fecha_fin) : 'Sin fin'}</td><td><span class="badge ${item.activa ? 'active' : 'inactive'}">${item.activa ? 'Activa' : 'Inactiva'}</span></td><td><div class="row-actions"><button class="button secondary small" type="button" onclick="editPromotion('${item.id}')">Editar</button><button class="button danger small" type="button" onclick="deletePromotion('${item.id}')">Eliminar</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">Sin promociones</td></tr>';
}

function newPromotion() {
  document.querySelector('#promotion-form').reset();
  document.querySelector('#promotion-id').value = '';
  document.querySelector('#promotion-modal-title').textContent = 'Nueva promoción';
  openModal('#promotion-modal');
}

window.editPromotion = (id) => {
  const item = promotions.find(promotion => promotion.id === id);
  if (!item) return;
  document.querySelector('#promotion-id').value = item.id;
  document.querySelector('#promotion-business').value = item.negocio_id;
  document.querySelector('#promotion-title').value = item.titulo;
  document.querySelector('#promotion-description').value = item.descripcion || '';
  document.querySelector('#promotion-image').value = item.imagen_url || '';
  document.querySelector('#promotion-start').value = item.fecha_inicio ? item.fecha_inicio.slice(0,16) : '';
  document.querySelector('#promotion-end').value = item.fecha_fin ? item.fecha_fin.slice(0,16) : '';
  document.querySelector('#promotion-active').checked = Boolean(item.activa);
  document.querySelector('#promotion-featured').checked = Boolean(item.destacada);
  document.querySelector('#promotion-modal-title').textContent = 'Editar promoción';
  openModal('#promotion-modal');
};

async function savePromotion(event) {
  event.preventDefault();
  const button = document.querySelector('#save-promotion');
  setLoading(button, true);
  const id = document.querySelector('#promotion-id').value;
  const payload = {
    negocio_id:document.querySelector('#promotion-business').value,
    titulo:document.querySelector('#promotion-title').value.trim(),
    descripcion:document.querySelector('#promotion-description').value.trim() || null,
    imagen_url:document.querySelector('#promotion-image').value.trim() || null,
    fecha_inicio:document.querySelector('#promotion-start').value ? new Date(document.querySelector('#promotion-start').value).toISOString() : null,
    fecha_fin:document.querySelector('#promotion-end').value ? new Date(document.querySelector('#promotion-end').value).toISOString() : null,
    activa:document.querySelector('#promotion-active').checked,
    destacada:document.querySelector('#promotion-featured').checked
  };

  try {
    const query = id ? supabase.from('promociones').update(payload).eq('id',id) : supabase.from('promociones').insert(payload);
    const { error } = await query;
    if (error) throw error;
    closeModal('#promotion-modal');
    toast(id ? 'Promoción actualizada' : 'Promoción creada');
    await loadPromotions();
  } catch (error) {
    toast(error.message || 'No fue posible guardar la promoción', 'error');
  } finally {
    setLoading(button, false);
  }
}

window.deletePromotion = async (id) => {
  if (!confirm('¿Eliminar esta promoción?')) return;
  const { error } = await supabase.from('promociones').delete().eq('id',id);
  if (error) return toast(error.message, 'error');
  toast('Promoción eliminada');
  await loadPromotions();
};
