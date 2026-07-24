import { requireAdmin, logout } from './auth.js?v=20260717-2';
import { supabase } from './supabase-client.js?v=20260717-2';
import { shell, esc, slugify, fmt, toast, openModal, closeModal, setLoading } from './ui.js?v=20260717-2';

let businesses = [];
let categories = [];

const MEDIA_BUCKET = 'negocios-media';
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;

const selectedMedia = {
  logo: null,
  cover: null
};
const auth = await requireAdmin();


function adminActionModal({title,description='',confirmText='Confirmar',danger=false,textarea=false,minLength=0,placeholder='',onConfirm}){
  document.querySelector('#admin-action-modal')?.remove();
  const modal=document.createElement('div');modal.id='admin-action-modal';modal.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:20px;backdrop-filter:blur(8px)';
  modal.innerHTML=`<section role="dialog" aria-modal="true" style="width:min(590px,100%);background:#11141c;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:28px;box-shadow:0 30px 100px rgba(0,0,0,.6)"><p class="eyebrow">MODERACIÓN</p><h2>${esc(title)}</h2>${description?`<p class="muted" style="line-height:1.6">${description}</p>`:''}${textarea?`<label class="field"><span>Motivo obligatorio</span><textarea id="admin-action-text" rows="6" minlength="${minLength}" placeholder="${esc(placeholder)}"></textarea><small class="muted">Mínimo ${minLength} caracteres. El negocio podrá ver este motivo.</small></label>`:''}<div class="actions" style="justify-content:flex-end;margin-top:22px"><button type="button" class="button secondary" data-cancel>Cancelar</button><button type="button" class="button ${danger?'danger':'primary'}" data-confirm>${esc(confirmText)}</button></div></section>`;
  document.body.appendChild(modal);const input=modal.querySelector('#admin-action-text');const confirm=modal.querySelector('[data-confirm]');const sync=()=>{if(input)confirm.disabled=input.value.trim().length<minLength;};input?.addEventListener('input',sync);sync();const close=()=>modal.remove();modal.querySelector('[data-cancel]').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close();});confirm.onclick=async()=>{confirm.disabled=true;const old=confirm.textContent;confirm.textContent='Procesando…';try{await onConfirm(input?.value.trim()||'');close();}catch(error){confirm.disabled=false;confirm.textContent=old;toast(error.message||'No fue posible completar la acción.','error');}};setTimeout(()=>input?.focus(),50);
}

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

  setupUploadField({
    type: 'logo',
    dropzone: '#logo-dropzone',
    input: '#business-logo-file',
    preview: '#logo-preview',
    status: '#logo-status',
    remove: '#remove-logo'
  });

  setupUploadField({
    type: 'cover',
    dropzone: '#cover-dropzone',
    input: '#business-cover-file',
    preview: '#cover-preview',
    status: '#cover-status',
    remove: '#remove-cover'
  });
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
    await loadModerationSummary();
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
      <td><span class="badge ${item.estado_operativo==='activo' ? 'active' : 'inactive'}">${({activo:'Activo',cerrado_temporalmente:'Cerrado temporalmente',suspendido:'Suspendido',eliminacion_programada:'Eliminación programada'})[item.estado_operativo||'activo']}</span>${item.motivo_suspension ? `<small class="muted">${esc(item.motivo_suspension)}</small>` : ''}</td>
      <td>${fmt(item.created_at)}</td>
      <td><div class="row-actions"><a class="button primary small" href="panel.html?admin_business=${encodeURIComponent(item.id)}">Administrar</a><button class="button secondary small" type="button" onclick="editBusiness('${item.id}')">Editar</button><a class="button secondary small" href="perfil.html?slug=${encodeURIComponent(item.slug)}" target="_blank" rel="noopener">Ver perfil</a>${item.estado_operativo==='suspendido' ? `<button class="button success small" type="button" onclick="liftSuspension('${item.id}')">Levantar suspensión</button>` : `<button class="button secondary small" type="button" onclick="suspendBusiness('${item.id}')">Suspender</button>`}<button class="button danger small" type="button" onclick="deleteBusiness('${item.id}')">Eliminar</button></div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Sin resultados</td></tr>';
}

function newBusiness() {
  document.querySelector('#business-form').reset();
  document.querySelector('#business-id').value = '';
  document.querySelector('#business-primary').value = '#111111';
  document.querySelector('#business-secondary').value = '#ffffff';
  document.querySelector('#business-modal-title').textContent = 'Nuevo negocio';
  resetMediaState();
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
  resetMediaState();
  setExistingPreview('logo', item.logo_url);
  setExistingPreview('cover', item.portada_url);
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
    let businessId = id;

    if (id) {
      const { error } = await supabase.from('negocios').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('negocios')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      businessId = data.id;
    }

    const mediaChanges = await uploadSelectedMedia(businessId, {
      logo_url: payload.logo_url,
      portada_url: payload.portada_url
    });

    if (Object.keys(mediaChanges).length) {
      const { error: mediaUpdateError } = await supabase
        .from('negocios')
        .update(mediaChanges)
        .eq('id', businessId);
      if (mediaUpdateError) throw mediaUpdateError;
    }

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

window.deactivateBusiness = async (id) => {
  const item = businesses.find(business => business.id === id);
  if (!item) return;
  const reason = window.prompt(`Motivo de la baja de ${item.nombre}:`, item.nombre.toLowerCase().includes('muestra') || item.nombre.toLowerCase().includes('demo') ? 'Perfil de demostración' : '');
  if (reason === null) return;
  if (!window.confirm(`¿Dar de baja a ${item.nombre}? Dejará de estar activo, pero sus datos se conservarán y podrá reactivarse.`)) return;
  const { error } = await supabase.rpc('admin_dar_baja_negocio', { p_negocio_id: id, p_motivo: reason.trim() || null });
  if (error) return toast(`${error.message}. Ejecuta 062_hotfix_redes_espera_y_bajas.sql.`, 'error');
  toast('Negocio dado de baja');
  await loadBusinesses();
};


window.deleteBusiness = async (id) => {
  const item = businesses.find(business => business.id === id);
  if (!item) return;

  document.querySelector('#delete-business-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'delete-business-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:20px;backdrop-filter:blur(8px)';
  modal.innerHTML = `
    <section role="dialog" aria-modal="true" aria-labelledby="delete-business-title" style="width:min(620px,100%);background:#11141c;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:28px;box-shadow:0 30px 100px rgba(0,0,0,.6)">
      <p class="eyebrow">ELIMINACIÓN DEFINITIVA</p>
      <h2 id="delete-business-title">Eliminar ${esc(item.nombre)}</h2>
      <p class="muted" style="line-height:1.6">Esta acción elimina definitivamente el negocio, sus accesos y su información relacionada. No se puede deshacer.</p>

      <label class="field">
        <span>Nombre para confirmar</span>
        <input id="delete-business-confirmation" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(item.nombre)}">
        <small class="muted">Escribe exactamente: <strong>${esc(item.nombre)}</strong></small>
      </label>

      <label class="field" style="margin-top:16px">
        <span>Motivo <small class="muted">(opcional)</small></span>
        <textarea id="delete-business-reason" rows="4" maxlength="500" placeholder="Ej. Perfil de demostración, registro duplicado o solicitud del propietario."></textarea>
        <small class="muted">Este dato se usa únicamente para el historial administrativo.</small>
      </label>

      <p id="delete-business-error" class="muted" role="alert" style="display:none;color:#ff8da1;margin:14px 0 0"></p>

      <div class="actions" style="justify-content:flex-end;margin-top:22px">
        <button type="button" class="button secondary" data-cancel>Cancelar</button>
        <button type="button" class="button danger" data-confirm disabled>Eliminar definitivamente</button>
      </div>
    </section>`;

  document.body.appendChild(modal);

  const confirmationInput = modal.querySelector('#delete-business-confirmation');
  const reasonInput = modal.querySelector('#delete-business-reason');
  const errorBox = modal.querySelector('#delete-business-error');
  const confirmButton = modal.querySelector('[data-confirm]');
  const cancelButton = modal.querySelector('[data-cancel]');
  const expectedName = item.nombre.trim();

  const close = () => modal.remove();
  const sync = () => {
    confirmButton.disabled = confirmationInput.value.trim() !== expectedName;
    errorBox.style.display = 'none';
  };

  confirmationInput.addEventListener('input', sync);
  cancelButton.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal && !confirmButton.disabled) return;
    if (event.target === modal) close();
  });

  confirmButton.addEventListener('click', async () => {
    if (confirmationInput.value.trim() !== expectedName) {
      errorBox.textContent = 'El nombre escrito no coincide exactamente.';
      errorBox.style.display = 'block';
      return;
    }

    const originalText = confirmButton.textContent;
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    confirmButton.textContent = 'Eliminando…';
    errorBox.style.display = 'none';

    try {
      const response = await withTimeout(
        supabase.rpc('admin_eliminar_negocio_definitivo', {
          p_negocio_id: id,
          p_nombre_confirmacion: confirmationInput.value.trim(),
          p_motivo: reasonInput.value.trim() || null
        }),
        'la eliminación del negocio',
        20000
      );

      if (response.error) throw response.error;

      close();
      toast('Negocio eliminado definitivamente');
      await loadBusinesses();
    } catch (error) {
      console.error('Error al eliminar negocio:', error);
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      confirmButton.textContent = originalText;
      errorBox.textContent = error.message || 'No fue posible eliminar el negocio.';
      errorBox.style.display = 'block';
    }
  });

  setTimeout(() => confirmationInput.focus(), 50);
};

window.reactivateBusiness = async (id) => {
  const item = businesses.find(business => business.id === id);
  if (!item || !window.confirm(`¿Reactivar a ${item.nombre}?`)) return;
  const { error } = await supabase.rpc('admin_reactivar_negocio', { p_negocio_id: id });
  if (error) return toast(`${error.message}. Ejecuta 062_hotfix_redes_espera_y_bajas.sql.`, 'error');
  toast('Negocio reactivado');
  await loadBusinesses();
};


function setupUploadField({ type, dropzone, input, preview, status, remove }) {
  const zone = document.querySelector(dropzone);
  const fileInput = document.querySelector(input);
  const previewElement = document.querySelector(preview);
  const statusElement = document.querySelector(status);
  const removeButton = document.querySelector(remove);

  const openPicker = () => fileInput.click();

  zone.addEventListener('click', openPicker);
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) prepareSelectedImage(type, file, previewElement, statusElement, removeButton);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
    });
  });

  zone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) prepareSelectedImage(type, file, previewElement, statusElement, removeButton);
  });

  removeButton.addEventListener('click', () => clearSelectedImage(type));
}

async function prepareSelectedImage(type, file, previewElement, statusElement, removeButton) {
  try {
    validateImage(file);
    statusElement.textContent = 'Optimizando imagen…';

    const options = type === 'logo'
      ? { maxWidth: 900, maxHeight: 900, quality: 0.88 }
      : { maxWidth: 1800, maxHeight: 1000, quality: 0.86 };

    const blob = await compressToWebP(file, options);
    const previewUrl = URL.createObjectURL(blob);

    if (selectedMedia[type]?.previewUrl) {
      URL.revokeObjectURL(selectedMedia[type].previewUrl);
    }

    selectedMedia[type] = {
      blob,
      previewUrl,
      originalName: file.name
    };

    previewElement.innerHTML = `<img src="${previewUrl}" alt="Vista previa">`;
    removeButton.classList.remove('hidden');
    statusElement.textContent =
      `Lista para subir · ${formatBytes(file.size)} → ${formatBytes(blob.size)}`;
  } catch (error) {
    toast(error.message, 'error');
    statusElement.textContent = 'No fue posible preparar la imagen.';
  }
}

function validateImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Selecciona una imagen JPG, PNG o WebP.');
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error('La imagen supera el máximo permitido de 10 MB.');
  }
}

async function compressToWebP(file, { maxWidth, maxHeight, quality }) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);

  if (typeof bitmap.close === 'function') bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('No se pudo convertir la imagen a WebP.')),
      'image/webp',
      quality
    );
  });
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    image.src = url;
  });
}

async function uploadSelectedMedia(businessId, currentUrls) {
  const changes = {};

  if (selectedMedia.logo?.blob) {
    changes.logo_url = await uploadBusinessImage(
      businessId,
      'logo',
      selectedMedia.logo.blob,
      currentUrls.logo_url
    );
  }

  if (selectedMedia.cover?.blob) {
    changes.portada_url = await uploadBusinessImage(
      businessId,
      'portada',
      selectedMedia.cover.blob,
      currentUrls.portada_url
    );
  }

  return changes;
}

async function uploadBusinessImage(businessId, kind, blob, previousUrl) {
  const path = `negocios/${businessId}/${kind}-${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false
    });

  if (error) throw new Error(`No se pudo subir ${kind}: ${error.message}`);

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  await removePreviousStorageFile(previousUrl);

  return publicUrl;
}

async function removePreviousStorageFile(url) {
  const path = extractStoragePath(url);
  if (!path) return;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) console.warn('No se pudo eliminar la imagen anterior:', error);
}

function extractStoragePath(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
}

function clearSelectedImage(type) {
  const config = type === 'logo'
    ? {
        preview: '#logo-preview',
        status: '#logo-status',
        remove: '#remove-logo',
        input: '#business-logo-file',
        fallback: 'Se optimizará automáticamente a WebP.'
      }
    : {
        preview: '#cover-preview',
        status: '#cover-status',
        remove: '#remove-cover',
        input: '#business-cover-file',
        fallback: 'Se optimizará automáticamente a WebP.'
      };

  if (selectedMedia[type]?.previewUrl) {
    URL.revokeObjectURL(selectedMedia[type].previewUrl);
  }

  selectedMedia[type] = null;
  document.querySelector(config.input).value = '';
  document.querySelector(config.preview).innerHTML = '<span class="upload-icon">＋</span>';
  document.querySelector(config.status).textContent = config.fallback;
  document.querySelector(config.remove).classList.add('hidden');
}

function resetMediaState() {
  clearSelectedImage('logo');
  clearSelectedImage('cover');
}

function setExistingPreview(type, url) {
  if (!url) return;

  const isLogo = type === 'logo';
  document.querySelector(isLogo ? '#logo-preview' : '#cover-preview').innerHTML =
    `<img src="${esc(url)}" alt="Imagen actual">`;
  document.querySelector(isLogo ? '#logo-status' : '#cover-status').textContent =
    'Imagen actual. Selecciona otra para reemplazarla.';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}



async function loadModerationSummary(){
  try{
    const [{data:reports},{data:appeals}]=await Promise.all([
      supabase.from('reportes_negocio').select('id,negocio_id,motivo,descripcion,estado,created_at,negocios(nombre)').in('estado',['pendiente','en_revision']).order('created_at',{ascending:false}).limit(20),
      supabase.from('apelaciones_suspension').select('id,negocio_id,explicacion,estado,created_at,negocios(nombre)').in('estado',['pendiente','en_revision']).order('created_at',{ascending:false}).limit(20)
    ]);
    let section=document.querySelector('#moderation-summary-runtime');
    if(!section){section=document.createElement('section');section.id='moderation-summary-runtime';section.style.cssText='margin:0 0 22px;padding:20px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(255,255,255,.03)';document.querySelector('main')?.prepend(section);}
    section.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap"><div><p class="eyebrow">MODERACIÓN</p><h2 style="margin:.2rem 0">Bandeja de revisión</h2><p class="muted" style="margin:0">Los reportes no suspenden automáticamente a ningún negocio.</p></div><div class="actions"><button class="button secondary" id="view-reports-runtime">Reportes pendientes: ${reports?.length||0}</button><button class="button secondary" id="view-appeals-runtime">Apelaciones: ${appeals?.length||0}</button></div></div>`;
    section.querySelector('#view-reports-runtime').onclick=()=>showModerationItems('Reportes pendientes',(reports||[]).map(x=>({title:x.negocios?.nombre||'Negocio',meta:x.motivo,body:x.descripcion,date:x.created_at})));
    section.querySelector('#view-appeals-runtime').onclick=()=>showModerationItems('Apelaciones pendientes',(appeals||[]).map(x=>({title:x.negocios?.nombre||'Negocio',meta:'Apelación de suspensión',body:x.explicacion,date:x.created_at})));
  }catch(error){console.warn('No fue posible cargar moderación',error);}
}
function showModerationItems(title,items){
  document.querySelector('#moderation-list-modal')?.remove();const modal=document.createElement('div');modal.id='moderation-list-modal';modal.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:20px';modal.innerHTML=`<section style="width:min(760px,100%);max-height:86vh;overflow:auto;background:#11141c;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:26px"><div style="display:flex;justify-content:space-between;gap:16px"><div><p class="eyebrow">ADMINISTRACIÓN</p><h2>${esc(title)}</h2></div><button class="icon-button" data-close>×</button></div><div style="display:grid;gap:12px">${items.length?items.map(x=>`<article style="padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:16px"><strong>${esc(x.title)}</strong><small class="muted" style="display:block;margin:.3rem 0">${esc(x.meta)} · ${fmt(x.date)}</small><p style="white-space:pre-wrap">${esc(x.body)}</p></article>`).join(''):'<p class="muted">No hay elementos pendientes.</p>'}</div></section>`;document.body.appendChild(modal);const close=()=>modal.remove();modal.querySelector('[data-close]').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close();});
}

async function suspendBusiness(id){const item=businesses.find(x=>x.id===id);adminActionModal({title:`Suspender ${item?.nombre||'negocio'}`,description:'El perfil desaparecerá del directorio. La suspensión no se aplica automáticamente por recibir reportes: administración debe revisar el caso y registrar un motivo claro.',confirmText:'Suspender negocio',danger:true,textarea:true,minLength:15,placeholder:'Describe la regla incumplida, los hechos revisados y la razón de la medida…',onConfirm:async reason=>{const {error}=await supabase.rpc('admin_suspender_negocio',{p_negocio_id:id,p_motivo:reason,p_hasta:null});if(error)throw error;toast('Negocio suspendido y notificado');await loadBusinesses();}});}
async function liftSuspension(id){const item=businesses.find(x=>x.id===id);adminActionModal({title:'Levantar suspensión',description:`${esc(item?.nombre||'El negocio')} volverá a estar activo y visible en el directorio.`,confirmText:'Reactivar negocio',onConfirm:async()=>{const {error}=await supabase.rpc('admin_levantar_suspension',{p_negocio_id:id});if(error)throw error;toast('Suspensión levantada');await loadBusinesses();}});}
window.suspendBusiness=suspendBusiness;window.liftSuspension=liftSuspension;
