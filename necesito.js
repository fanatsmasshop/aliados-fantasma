import { supabase } from './supabase-client.js?v=20260720-600';
import { populateStateSelect } from './mexico-geo.js?v=20260814-NACIONAL1';

const form = document.querySelector('#need-form');
const alertBox = document.querySelector('#need-alert');
const submitButton = document.querySelector('#need-submit');
const formWrap = document.querySelector('#need-form-wrap');
const success = document.querySelector('#need-success');
const another = document.querySelector('#need-another');
const categorySelect = document.querySelector('#need-category');
const stateSelect = document.querySelector('#need-state');
const trackLink = document.querySelector('#need-track');

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

function showAlert(message, type='error'){
  alertBox.textContent = message;
  alertBox.className = `need-alert show ${type}`;
  alertBox.scrollIntoView({behavior:'smooth',block:'center'});
}

function clearAlert(){
  alertBox.textContent = '';
  alertBox.className = 'need-alert';
}

function cleanPhone(value){
  let digits = String(value || '').replace(/\D/g,'');
  if(digits.startsWith('521') && digits.length === 13) digits = `52${digits.slice(3)}`;
  return digits;
}

function selectedCategory(){
  if(categorySelect.selectedIndex <= 0) return {id:null,name:''};
  const option = categorySelect.options[categorySelect.selectedIndex];
  return {
    id: option?.value || null,
    name: option?.dataset.name || option?.textContent?.trim() || 'Otros negocios'
  };
}

async function loadCategories(){
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
    console.warn('No fue posible cargar categorías desde la base:', error);
  }

  FALLBACK_CATEGORIES.forEach(([name,slug]) => {
    const option = document.createElement('option');
    option.value = '';
    option.dataset.name = name;
    option.dataset.slug = slug;
    option.textContent = name;
    categorySelect.appendChild(option);
  });
}

function setDefaultLocation(){
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
  if(payload.descripcion.length < 10) return 'Agrega una descripción para que los negocios puedan cotizarte.';
  if(!payload.categoria_texto) return 'Selecciona una categoría.';
  if(!payload.estado_region) return 'Selecciona tu estado.';
  if(payload.municipio.length < 2) return 'Escribe tu municipio o alcaldía.';
  if(payload.nombre_cliente.length < 2) return 'Escribe tu nombre o apodo.';
  if(payload.whatsapp.length < 10 || payload.whatsapp.length > 15) return 'Escribe un WhatsApp válido de 10 a 15 dígitos.';
  if(!form.elements.acepta_compartir_contacto.checked) return 'Debes autorizar compartir tu contacto con los negocios registrados.';
  if(payload.presupuesto_min != null && payload.presupuesto_max != null && payload.presupuesto_max < payload.presupuesto_min) return 'El presupuesto máximo no puede ser menor al mínimo.';
  return '';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  clearAlert();
  if(!supabase){ showAlert('La conexión con Aliados Fantasma no está disponible en este momento.'); return; }

  const fd = new FormData(form);
  const category = selectedCategory();
  const minRaw = String(fd.get('presupuesto_min') || '').trim();
  const maxRaw = String(fd.get('presupuesto_max') || '').trim();

  const payload = {
    categoria_id: category.id || null,
    categoria_texto: category.name,
    nombre_cliente: String(fd.get('nombre_cliente') || '').trim(),
    whatsapp: cleanPhone(fd.get('whatsapp')),
    titulo: String(fd.get('titulo') || '').trim(),
    descripcion: String(fd.get('descripcion') || '').trim(),
    estado_region: String(fd.get('estado_region') || '').trim(),
    municipio: String(fd.get('municipio') || '').trim(),
    colonia: String(fd.get('colonia') || '').trim() || null,
    presupuesto_min: minRaw ? Number(minRaw) : null,
    presupuesto_max: maxRaw ? Number(maxRaw) : null,
    fecha_necesaria: String(fd.get('fecha_necesaria') || '').trim() || null,
    urgencia: String(fd.get('urgencia') || 'normal'),
    acepta_compartir_contacto: Boolean(form.elements.acepta_compartir_contacto.checked)
  };

  const validationError = validate(payload);
  if(validationError){ showAlert(validationError); return; }

  submitButton.disabled = true;
  submitButton.innerHTML = 'Publicando…';

  const {data,error} = await supabase.rpc('af_publicar_necesidad',{
    p_categoria_id:payload.categoria_id,p_categoria_texto:payload.categoria_texto,p_nombre_cliente:payload.nombre_cliente,p_whatsapp:payload.whatsapp,p_titulo:payload.titulo,p_descripcion:payload.descripcion,p_estado_region:payload.estado_region,p_municipio:payload.municipio,p_colonia:payload.colonia,p_presupuesto_min:payload.presupuesto_min,p_presupuesto_max:payload.presupuesto_max,p_fecha_necesaria:payload.fecha_necesaria,p_urgencia:payload.urgencia
  });

  submitButton.disabled = false;
  submitButton.innerHTML = 'Publicar mi necesidad <span>→</span>';

  if(error){
    const text = String(error.message || '');
    if(/Límite alcanzado/i.test(text)) showAlert('Ya publicaste 3 solicitudes con este WhatsApp en las últimas 24 horas. Intenta de nuevo mañana.');
    else if(/af_publicar_necesidad|schema cache|permission denied|does not exist/i.test(text)) showAlert('El motor MATCH todavía no está disponible en esta publicación.');
    else showAlert('No pudimos publicar la solicitud. Revisa los datos e inténtalo de nuevo.');
    console.error(error);
    return;
  }
  const result=Array.isArray(data)?data[0]:data;
  if(result?.tracking_token){localStorage.setItem('af_last_need_token',result.tracking_token);if(trackLink)trackLink.href=`seguimiento.html?t=${encodeURIComponent(result.tracking_token)}`;}

  form.reset();
  setDefaultLocation();
  formWrap.style.display = 'none';
  success.classList.add('show');
  success.scrollIntoView({behavior:'smooth',block:'center'});
});

another.addEventListener('click', () => {
  success.classList.remove('show');
  formWrap.style.display = '';
  clearAlert();
  formWrap.scrollIntoView({behavior:'smooth',block:'start'});
});


const dateInput = form.elements.fecha_necesaria;
if(dateInput){
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  dateInput.min = local;
}

setDefaultLocation();
loadCategories();
