import { requireAdmin, logout } from './auth.js?v=20260717-1';
import { supabase } from './supabase-client.js?v=20260717-1';
import { shell, esc, slugify, fmt, toast, openModal, closeModal, setLoading } from './ui.js?v=20260717-1';

let businesses = [];
let categories = [];
const auth = await requireAdmin();

function withTimeout(promise, label, milliseconds = 15000) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tiempo de espera agotado al consultar ${label}`)), milliseconds);
    })
  ]);
}


if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button').addEventListener('click', logout);
  bind();
  await loadCategories();
  await loadBusinesses();
}

function bind() {
  document.querySelector('#new-business').addEventListener('click', newBusiness);
  document.querySelector('#business-name').addEventListener('input', (event) => {
    if (!document.querySelector('#business-id').value) document.querySelector('#business-slug').value = slugify(event.target.value);
  });
  document.querySelector('#business-form').addEventListener('submit', saveBusiness);
  document.querySelector('#search').addEventListener('input', render);
  document.querySelector('#status-filter').addEventListener('change', render);
  document.querySelector('#category-filter').addEventListener('change', render);
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
}

async function loadCategories() {
  try {
    const { data, error } = await withTimeout(
      supabase.from('categorias').select('id,nombre').order('orden'),
      'categorías'
    );
    if (error) throw error;
    categories = data || [];
  } catch (error) {
    console.error('Error de categorías:', error);
    toast(`No se cargaron categorías: ${error.message}`, 'error');
    document.querySelector('#business-category').innerHTML =
      '<option value="">Error al cargar categorías</option>';
    document.querySelector('#category-filter').innerHTML =
      '<option value="">Error al cargar categorías</option>';
    return;
  }
  const options = '<option value="">Sin categoría</option>' + categories.map(item => `<option value="${item.id}">${esc(item.nombre)}</option>`).join('');
  document.querySelector('#business-category').innerHTML = options;
  document.querySelector('#category-filter').innerHTML = '<option value="">Todas las categorías</option>' + categories.map(item => `<option value="${item.id}">${esc(item.nombre)}</option>`).join('');
}

async function loadBusinesses() {
  try {
    const { data, error } = await withTimeout(
      supabase.from('negocios').select('*,categorias(nombre)').order('created_at',{ascending:false}),
      'negocios'
    );
    if (error) throw error;
    businesses = data || [];
    render();
  } catch (error) {
    console.error('Error de negocios:', error);
    toast(`No se cargaron negocios: ${error.message}`, 'error');
    document.querySelector('#business-body').innerHTML =
      `<tr><td colspan="6" class="empty-state">No se pudieron cargar los negocios: ${esc(error.message)}</td></tr>`;
  }
}

function render() {
  const term = document.querySelector('#search').value.toLowerCase();
  const status = document.querySelector('#status-filter').value;
  const category = document.querySelector('#category-filter').value;
  const filtered = businesses.filter(item =>
    (!term || [item.nombre,item.slug,item.municipio].some(value => (value || '').toLowerCase().includes(term))) &&
    (!status || (status === 'active' ? item.activo : !item.activo)) &&
    (!category || item.categoria_id === category)
  );

  document.querySelector('#business-body').innerHTML = filtered.length ? filtered.map(item => `
    <tr>
      <td><div class="business-cell"><span class="business-logo">${item.logo_url ? `<img src="${esc(item.logo_url)}" alt="">` : esc(item.nombre.charAt(0))}</span><div><strong>${esc(item.nombre)}</strong><small class="muted">/${esc(item.slug)}</small></div></div></td>
      <td>${esc(item.categorias?.nombre || 'Sin categoría')}</td>
      <td>${esc([item.colonia,item.municipio].filter(Boolean).join(', ') || 'Sin ubicación')}</td>
      <td><span class="badge ${item.activo ? 'active' : 'inactive'}">${item.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>${fmt(item.created_at)}</td>
      <td><div class="row-actions"><button class="button secondary small" type="button" onclick="editBusiness('${item.id}')">Editar</button><a class="button secondary small" href="perfil.html?slug=${encodeURIComponent(item.slug)}" target="_blank" rel="noopener">Perfil</a><button class="button ${item.activo ? 'danger' : 'success'} small" type="button" onclick="toggleBusiness('${item.id}',${!item.activo})">${item.activo ? 'Desactivar' : 'Activar'}</button></div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Sin resultados</td></tr>';
}

function newBusiness() {
  document.querySelector('#business-form').reset();
  document.querySelector('#business-id').value = '';
  document.querySelector('#business-primary').value = '#111111';
  document.querySelector('#business-secondary').value = '#ffffff';
  document.querySelector('#business-modal-title').textContent = 'Nuevo negocio';
  openModal('#business-modal');
}

window.editBusiness = (id) => {
  const item = businesses.find(business => business.id === id);
  if (!item) return;
  const mapping = {id:'business-id',nombre:'business-name',slug:'business-slug',categoria_id:'business-category',whatsapp:'business-whatsapp',correo:'business-email',telefono:'business-phone',descripcion_corta:'business-short',descripcion:'business-description',direccion:'business-address',colonia:'business-colony',municipio:'business-municipality',codigo_postal:'business-zip',enlace_maps:'business-maps',logo_url:'business-logo',portada_url:'business-cover',color_primario:'business-primary',color_secundario:'business-secondary'};
  Object.entries(mapping).forEach(([key, element]) => document.querySelector(`#${element}`).value = item[key] || '');
  document.querySelector('#business-active').checked = Boolean(item.activo);
  document.querySelector('#business-featured').checked = Boolean(item.destacado);
  document.querySelector('#business-modal-title').textContent = 'Editar negocio';
  openModal('#business-modal');
};

async function saveBusiness(event) {
  event.preventDefault();
  const button = document.querySelector('#save-business');
  setLoading(button, true);
  const id = document.querySelector('#business-id').value;
  const payload = {
    nombre:document.querySelector('#business-name').value.trim(), slug:slugify(document.querySelector('#business-slug').value),
    categoria_id:document.querySelector('#business-category').value || null, whatsapp:document.querySelector('#business-whatsapp').value.trim() || null,
    correo:document.querySelector('#business-email').value.trim() || null, telefono:document.querySelector('#business-phone').value.trim() || null,
    descripcion_corta:document.querySelector('#business-short').value.trim() || null, descripcion:document.querySelector('#business-description').value.trim() || null,
    direccion:document.querySelector('#business-address').value.trim() || null, colonia:document.querySelector('#business-colony').value.trim() || null,
    municipio:document.querySelector('#business-municipality').value.trim() || null, codigo_postal:document.querySelector('#business-zip').value.trim() || null,
    enlace_maps:document.querySelector('#business-maps').value.trim() || null, logo_url:document.querySelector('#business-logo').value.trim() || null,
    portada_url:document.querySelector('#business-cover').value.trim() || null, color_primario:document.querySelector('#business-primary').value.trim() || '#111111',
    color_secundario:document.querySelector('#business-secondary').value.trim() || '#ffffff', activo:document.querySelector('#business-active').checked,
    destacado:document.querySelector('#business-featured').checked
  };

  try {
    const query = id ? supabase.from('negocios').update(payload).eq('id',id) : supabase.from('negocios').insert(payload);
    const { error } = await query;
    if (error) throw error;
    closeModal('#business-modal');
    toast(id ? 'Negocio actualizado' : 'Negocio creado');
    await loadBusinesses();
  } catch (error) {
    toast(error.message || 'No fue posible guardar el negocio', 'error');
  } finally {
    setLoading(button, false);
  }
}

window.toggleBusiness = async (id, active) => {
  const { error } = await supabase.from('negocios').update({activo:active}).eq('id',id);
  if (error) return toast(error.message, 'error');
  toast(active ? 'Negocio activado' : 'Negocio desactivado');
  await loadBusinesses();
};
