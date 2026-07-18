import { supabase } from './supabase-client.js?v=20260717-2';
import { requireAdmin, logout } from './auth.js?v=20260717-2';
import { shell, esc, fmt } from './ui.js?v=20260717-2';

let rows = [];

const body = document.querySelector('#pre-body');
const warning = document.querySelector('#warning');
const search = document.querySelector('#search');
const filter = document.querySelector('#status-filter');
const refreshButton = document.querySelector('#refresh-button');

function withTimeout(promise, milliseconds = 15000) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('La consulta tardó demasiado tiempo.')), milliseconds);
    })
  ]);
}

async function load() {
  warning.classList.add('hidden');
  warning.textContent = '';
  refreshButton.disabled = true;
  body.innerHTML = '<tr><td colspan="7" class="empty-state">Cargando…</td></tr>';

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('pre_registros')
        .select('*')
        .order('created_at', { ascending: false })
    );

    if (error) throw error;

    rows = data || [];
    render();
  } catch (error) {
    console.error('Error al cargar pre-registros:', error);
    warning.textContent = `No se pudieron cargar los pre-registros: ${error.message || 'error desconocido'}`;
    warning.classList.remove('hidden');
    body.innerHTML = '<tr><td colspan="7" class="empty-state">No fue posible cargar la información.</td></tr>';
  } finally {
    refreshButton.disabled = false;
  }
}

function render() {
  const term = search.value.trim().toLowerCase();
  const status = filter.value;

  const visible = rows.filter((row) => {
    const searchable = [
      row.nombre_negocio,
      row.nombre_responsable,
      row.correo,
      row.municipio,
      row.colonia,
      row.whatsapp
    ].join(' ').toLowerCase();

    return (!status || row.estado === status) && (!term || searchable.includes(term));
  });

  if (!visible.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">No hay pre-registros para mostrar.</td></tr>';
    return;
  }

  body.innerHTML = visible.map((row) => `
    <tr>
      <td>
        <strong>${esc(row.nombre_negocio || '—')}</strong>
        <small>${esc(row.categoria || 'Sin categoría')}</small>
      </td>
      <td>${esc(row.nombre_responsable || '—')}</td>
      <td>
        <a href="mailto:${esc(row.correo || '')}">${esc(row.correo || '—')}</a>
        <small>${esc(row.whatsapp || '—')}</small>
      </td>
      <td>
        ${esc(row.colonia || '—')}
        <small>${esc(row.municipio || '—')}</small>
      </td>
      <td>${row.correo_verificado ? '✅ Sí' : '⏳ Pendiente'}</td>
      <td>
        <select class="status-select" data-id="${row.id}">
          <option value="pendiente" ${row.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="contactado" ${row.estado === 'contactado' ? 'selected' : ''}>Contactado</option>
          <option value="aprobado" ${row.estado === 'aprobado' ? 'selected' : ''}>Aprobado</option>
          <option value="rechazado" ${row.estado === 'rechazado' ? 'selected' : ''}>Rechazado</option>
        </select>
      </td>
      <td>${fmt(row.created_at)}</td>
    </tr>
  `).join('');

  document.querySelectorAll('.status-select').forEach((element) => {
    element.addEventListener('change', () => updateStatus(element.dataset.id, element.value));
  });
}

async function updateStatus(id, estado) {
  try {
    const { error } = await supabase
      .from('pre_registros')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    const row = rows.find((item) => item.id === id);
    if (row) row.estado = estado;
  } catch (error) {
    console.error('Error al actualizar pre-registro:', error);
    alert(`No fue posible actualizar el estado: ${error.message || 'error desconocido'}`);
    await load();
  }
}

search.addEventListener('input', render);
filter.addEventListener('change', render);
refreshButton.addEventListener('click', load);

const auth = await requireAdmin();
if (auth) {
  shell(auth.profile, auth.user);
  document.querySelector('#logout-button')?.addEventListener('click', logout);
  await load();
}
