import { supabase } from './supabase-client.js?v=20260720-600';
import { populateStateSelect } from './mexico-geo.js?v=20260814-NACIONAL1';

const form = document.querySelector('#home-need-form');
const section = document.querySelector('#lo-necesito');
const alertBox = document.querySelector('#home-need-alert');
const submitButton = document.querySelector('#home-need-submit');
const formPanel = document.querySelector('#home-need-form-panel');
const successPanel = document.querySelector('#home-need-success');
const anotherButton = document.querySelector('#home-need-another');
const categorySelect = document.querySelector('#home-need-category');
const stateSelect = document.querySelector('#home-need-state');
const businessStatus = document.querySelector('#home-need-business-status');
const businessButton = document.querySelector('#home-need-business-button');
const businessMeta = document.querySelector('#home-need-business-meta');

const FALLBACK_CATEGORIES = [
  ['Alimentos y bebidas','alimentos-y-bebidas'],
  ['Belleza y cuidado personal','belleza-y-cuidado-personal'],
  ['Educación','educacion'],
  ['Hogar y mantenimiento','hogar-y-mantenimiento'],
  ['Mascotas','mascotas'],
  ['Moda y accesorios','moda-y-accesorios'],
  ['Salud y bienestar','salud-y-bienestar'],
  ['Servicios profesionales','servicios-profesionales'],
  ['Tecnología e internet','tecnologia-e-internet'],
  ['Otros negocios','otros-negocios']
];

const cleanPhone = value => {
  let digits = String(value || '').replace(/\D/g,'');
  if(digits.startsWith('521') && digits.length === 13) digits = `52${digits.slice(3)}`;
  return digits;
};

function showAlert(message, type='error'){
  if(!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `need-alert show ${type}`;
  alertBox.scrollIntoView({behavior:'smooth',block:'center'});
}

function clearAlert(){
  if(!alertBox) return;
  alertBox.textContent = '';
  alertBox.className = 'need-alert';
}

function selectedCategory(){
  const option = categorySelect?.options?.[categorySelect.selectedIndex];
  if(!option || categorySelect.selectedIndex <= 0) return {id:null,name:''};
  const raw = option.value || '';
  return {
    id: raw.startsWith('fallback:') ? null : (raw || null),
    name: option.dataset.name || option.textContent?.trim() || 'Otros negocios'
  };
}

async function loadCategories(){
  if(!categorySelect) return;
  categorySelect.innerHTML = '<option value="">Selecciona una categoría</option>';
  try{
    if(!supabase) throw new Error('Supabase no configurado');
    const {data,error} = await supabase.from('categorias').select('id,nombre,slug').eq('activa',true).order('nombre');
    if(error) throw error;
    (data || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.dataset.name = item.nombre;
      option.textContent = item.nombre;
      categorySelect.appendChild(option);
    });
    if(data?.length) return;
  }catch(error){
    console.warn('No fue posible cargar categorías en inicio:', error);
  }
  FALLBACK_CATEGORIES.forEach(([name,slug]) => {
    const option = document.createElement('option');
    option.value = `fallback:${slug}`;
    option.dataset.name = name;
    option.textContent = name;
    categorySelect.appendChild(option);
  });
}

function setDefaultLocation(){
  if(!stateSelect) return;
  try{
    populateStateSelect(stateSelect);
    const mexico = [...stateSelect.options].find(option => /estado de m[eé]xico/i.test(option.textContent || option.value));
    if(mexico) stateSelect.value = mexico.value;
  }catch(error){
    console.warn('No se pudo inicializar el selector de estados:', error);
  }
}

function validate(payload){
  if(payload.titulo.length < 4) return 'Escribe con más detalle qué necesitas.';
  if(payload.descripcion.length < 10) return 'Agrega una descripción para que un negocio pueda cotizarte.';
  if(!payload.categoria_texto) return 'Selecciona una categoría.';
  if(!payload.estado_region) return 'Selecciona tu estado.';
  if(payload.municipio.length < 2) return 'Escribe tu municipio o alcaldía.';
  if(payload.nombre_cliente.length < 2) return 'Escribe tu nombre o apodo.';
  if(payload.whatsapp.length < 10 || payload.whatsapp.length > 15) return 'Escribe un WhatsApp válido de 10 a 15 dígitos.';
  if(!form.elements.acepta_compartir_contacto.checked) return 'Debes autorizar compartir tu contacto con negocios registrados.';
  if(payload.presupuesto_max != null && (!Number.isFinite(payload.presupuesto_max) || payload.presupuesto_max < 0)) return 'Escribe un presupuesto válido o déjalo vacío.';
  return '';
}

async function publishNeed(event){
  event.preventDefault();
  clearAlert();
  if(!supabase){
    showAlert('La conexión con Aliados Fantasma no está disponible en este momento.');
    return;
  }

  const fd = new FormData(form);
  const category = selectedCategory();
  const budgetRaw = String(fd.get('presupuesto_max') || '').trim();
  const payload = {
    categoria_id: category.id,
    categoria_texto: category.name,
    nombre_cliente: String(fd.get('nombre_cliente') || '').trim(),
    whatsapp: cleanPhone(fd.get('whatsapp')),
    titulo: String(fd.get('titulo') || '').trim(),
    descripcion: String(fd.get('descripcion') || '').trim(),
    estado_region: String(fd.get('estado_region') || '').trim(),
    municipio: String(fd.get('municipio') || '').trim(),
    colonia: null,
    presupuesto_min: null,
    presupuesto_max: budgetRaw ? Number(budgetRaw) : null,
    fecha_necesaria: null,
    urgencia: String(fd.get('urgencia') || 'normal'),
    acepta_compartir_contacto: Boolean(form.elements.acepta_compartir_contacto.checked)
  };

  const validationError = validate(payload);
  if(validationError){
    showAlert(validationError);
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = 'Publicando…';
  const {error} = await supabase.from('necesidades').insert(payload);
  submitButton.disabled = false;
  submitButton.innerHTML = 'Publicar y recibir opciones <span>→</span>';

  if(error){
    console.error(error);
    const text = String(error.message || '');
    if(/Límite alcanzado/i.test(text)) showAlert('Ya publicaste 3 solicitudes con este WhatsApp en las últimas 24 horas. Intenta de nuevo mañana.');
    else if(/relation .*necesidades.* does not exist|schema cache|permission denied/i.test(text)) showAlert('“Lo necesito” todavía no está activado en la base. Ejecuta 078_lo_necesito.sql y vuelve a intentar.');
    else showAlert('No pudimos publicar la solicitud. Revisa los datos e inténtalo nuevamente.');
    return;
  }

  form.reset();
  setDefaultLocation();
  formPanel.hidden = true;
  successPanel.hidden = false;
  successPanel.scrollIntoView({behavior:'smooth',block:'center'});
}

function resetForm(){
  successPanel.hidden = true;
  formPanel.hidden = false;
  clearAlert();
  formPanel.scrollIntoView({behavior:'smooth',block:'center'});
}

function bindIndexLinks(){
  document.querySelectorAll('a[href="#lo-necesito"],button[data-home-need-open]').forEach(control => {
    control.addEventListener('click', event => {
      if(control.tagName === 'BUTTON') event.preventDefault();
      window.setTimeout(() => section?.scrollIntoView({behavior:'smooth',block:'start'}),0);
    });
  });
}

async function setupBusinessEntry(){
  if(!businessButton || !businessStatus) return;
  businessButton.href = 'login.html?return=oportunidades.html';
  businessStatus.textContent = 'Si tienes un negocio, inicia sesión para ver solicitudes de personas que ya están buscando algo.';
  businessButton.textContent = 'Entrar a oportunidades →';
  if(businessMeta) businessMeta.textContent = 'Solo negocios vinculados pueden ver los datos de contacto.';

  if(!supabase) return;
  try{
    const {data:{user}} = await supabase.auth.getUser();
    if(!user) return;

    const [{data:profile},{data:memberships,error:membershipError}] = await Promise.all([
      supabase.from('perfiles').select('rol,activo').eq('id',user.id).maybeSingle(),
      supabase.from('miembros_negocio').select('negocio_id,activo,negocios(id,nombre,estado_operativo)').eq('perfil_id',user.id).eq('activo',true)
    ]);
    if(membershipError) throw membershipError;

    const activeMembership = (memberships || []).find(row => row.negocios && !['suspendido','eliminacion_programada'].includes(row.negocios.estado_operativo));
    const isAdmin = profile?.rol === 'administrador' && profile?.activo === true;
    if(!activeMembership && !isAdmin){
      businessStatus.textContent = 'Tu sesión está activa, pero todavía no encontramos un negocio habilitado para responder solicitudes.';
      businessButton.href = 'panel.html';
      businessButton.textContent = 'Completar mi negocio →';
      return;
    }

    if(activeMembership){
      const business = activeMembership.negocios;
      let countLabel = 'Hay oportunidades esperando respuesta.';
      try{
        const now = new Date().toISOString();
        const {count,error} = await supabase.from('necesidades').select('id',{count:'exact',head:true}).eq('estado','abierta').gt('expires_at',now);
        if(!error && Number.isFinite(count)) countLabel = `${count} oportunidad${count === 1 ? '' : 'es'} activa${count === 1 ? '' : 's'} en la red.`;
      }catch{}
      businessStatus.textContent = `${business.nombre}: ${countLabel}`;
      businessButton.href = `oportunidades.html?business=${encodeURIComponent(business.id)}`;
      businessButton.textContent = 'Ver oportunidades ahora →';
      if(businessMeta) businessMeta.textContent = 'Puedes cotizar y abrir WhatsApp desde la misma oportunidad.';
    }else if(isAdmin){
      businessStatus.textContent = 'Sesión administrativa activa. Elige un negocio desde el panel para responder oportunidades.';
      businessButton.href = 'dashboard.html';
      businessButton.textContent = 'Ir a administración →';
    }
  }catch(error){
    console.warn('No se pudo personalizar el acceso a oportunidades:', error);
  }
}

if(form){
  form.addEventListener('submit',publishNeed);
  anotherButton?.addEventListener('click',resetForm);
  setDefaultLocation();
  loadCategories();
  bindIndexLinks();
  setupBusinessEntry();
}
