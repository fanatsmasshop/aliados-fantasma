import { supabase } from './supabase-client.js?v=20260720-600';
import { populateStateSelect } from './mexico-geo.js?v=20260814-NACIONAL1';

const form = document.querySelector('#home-need-form');
const section = document.querySelector('#lo-necesito');
const alertBox = document.querySelector('#home-need-alert');
const submitButton = document.querySelector('#home-need-submit');
const formPanel = document.querySelector('#home-need-form-panel');
const successPanel = document.querySelector('#home-need-success');
const anotherButton = document.querySelector('#home-need-another');
const trackingLink = document.querySelector('#home-need-track');
const categorySelect = document.querySelector('#home-need-category');
const stateSelect = document.querySelector('#home-need-state');
const businessStatus = document.querySelector('#home-need-business-status');
const businessButton = document.querySelector('#home-need-business-button');
const businessMeta = document.querySelector('#home-need-business-meta');
const activityList = document.querySelector('#home-need-activity-list');
const activityStatus = document.querySelector('#home-need-activity-status');
const activityTotal = document.querySelector('#home-need-activity-total');
const activityReplies = document.querySelector('#home-need-activity-replies');
const lastNeedBanner = document.querySelector('#home-last-need');
const lastNeedLink = document.querySelector('#home-last-need-link');

const STORAGE_TOKEN = 'af_last_need_token';
const STORAGE_HISTORY = 'af_need_tokens';
const FALLBACK_CATEGORIES = [
  ['Alimentos y bebidas','alimentos-y-bebidas'],['Belleza y cuidado personal','belleza-y-cuidado-personal'],['Educación','educacion'],['Hogar y mantenimiento','hogar-y-mantenimiento'],['Mascotas','mascotas'],['Moda y accesorios','moda-y-accesorios'],['Salud y bienestar','salud-y-bienestar'],['Servicios profesionales','servicios-profesionales'],['Tecnología e internet','tecnologia-e-internet'],['Otros negocios','otros-negocios']
];

const cleanPhone = value => {
  let digits = String(value || '').replace(/\D/g,'');
  if(digits.startsWith('521') && digits.length === 13) digits = `52${digits.slice(3)}`;
  return digits;
};
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

function showAlert(message, type='error'){
  if(!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `need-alert show ${type}`;
  alertBox.scrollIntoView({behavior:'smooth',block:'center'});
}
function clearAlert(){ if(alertBox){alertBox.textContent='';alertBox.className='need-alert';} }
function selectedCategory(){
  const option = categorySelect?.options?.[categorySelect.selectedIndex];
  if(!option || categorySelect.selectedIndex <= 0) return {id:null,name:''};
  const raw = option.value || '';
  return {id:raw.startsWith('fallback:')?null:(raw||null),name:option.dataset.name||option.textContent?.trim()||'Otros negocios'};
}
async function loadCategories(){
  if(!categorySelect) return;
  categorySelect.innerHTML='<option value="">Selecciona una categoría</option>';
  try{
    if(!supabase) throw new Error('Supabase no configurado');
    const {data,error}=await supabase.from('categorias').select('id,nombre,slug').eq('activa',true).order('nombre');
    if(error) throw error;
    (data||[]).forEach(item=>{const option=document.createElement('option');option.value=item.id;option.dataset.name=item.nombre;option.textContent=item.nombre;categorySelect.appendChild(option);});
    if(data?.length) return;
  }catch(error){ console.warn('No fue posible cargar categorías en inicio:',error); }
  FALLBACK_CATEGORIES.forEach(([name,slug])=>{const option=document.createElement('option');option.value=`fallback:${slug}`;option.dataset.name=name;option.textContent=name;categorySelect.appendChild(option);});
}
function setDefaultLocation(){
  if(!stateSelect) return;
  try{populateStateSelect(stateSelect);const mexico=[...stateSelect.options].find(option=>/estado de m[eé]xico/i.test(option.textContent||option.value));if(mexico)stateSelect.value=mexico.value;}catch(error){console.warn('No se pudo inicializar el selector de estados:',error);}
}
function validate(payload){
  if(payload.titulo.length<4)return'Escribe con más detalle qué necesitas.';
  if(payload.descripcion.length<10)return'Agrega una descripción para que un negocio pueda cotizarte.';
  if(!payload.categoria_texto)return'Selecciona una categoría.';
  if(!payload.estado_region)return'Selecciona tu estado.';
  if(payload.municipio.length<2)return'Escribe tu municipio o alcaldía.';
  if(payload.nombre_cliente.length<2)return'Escribe tu nombre o apodo.';
  if(payload.whatsapp.length<10||payload.whatsapp.length>15)return'Escribe un WhatsApp válido de 10 a 15 dígitos.';
  if(!form.elements.acepta_compartir_contacto.checked)return'Debes autorizar compartir tu contacto con negocios registrados.';
  if(payload.presupuesto_max!=null&&(!Number.isFinite(payload.presupuesto_max)||payload.presupuesto_max<0))return'Escribe un presupuesto válido o déjalo vacío.';
  return'';
}
function rememberToken(token){
  if(!token)return;
  localStorage.setItem(STORAGE_TOKEN,token);
  let history=[];try{history=JSON.parse(localStorage.getItem(STORAGE_HISTORY)||'[]');}catch{}
  history=[token,...history.filter(item=>item!==token)].slice(0,5);
  localStorage.setItem(STORAGE_HISTORY,JSON.stringify(history));
}
function trackingUrl(token){return `seguimiento.html?t=${encodeURIComponent(token)}`;}

async function publishNeed(event){
  event.preventDefault();clearAlert();
  if(!supabase){showAlert('La conexión con Aliados Fantasma no está disponible en este momento.');return;}
  const fd=new FormData(form);const category=selectedCategory();const budgetRaw=String(fd.get('presupuesto_max')||'').trim();
  const payload={categoria_id:category.id,categoria_texto:category.name,nombre_cliente:String(fd.get('nombre_cliente')||'').trim(),whatsapp:cleanPhone(fd.get('whatsapp')),titulo:String(fd.get('titulo')||'').trim(),descripcion:String(fd.get('descripcion')||'').trim(),estado_region:String(fd.get('estado_region')||'').trim(),municipio:String(fd.get('municipio')||'').trim(),colonia:null,presupuesto_min:null,presupuesto_max:budgetRaw?Number(budgetRaw):null,fecha_necesaria:null,urgencia:String(fd.get('urgencia')||'normal')};
  const validationError=validate(payload);if(validationError){showAlert(validationError);return;}
  submitButton.disabled=true;submitButton.innerHTML='Buscando coincidencias…';
  const {data,error}=await supabase.rpc('af_publicar_necesidad_v2',{
    p_categoria_id:payload.categoria_id,p_categoria_texto:payload.categoria_texto,p_nombre_cliente:payload.nombre_cliente,p_whatsapp:payload.whatsapp,p_titulo:payload.titulo,p_descripcion:payload.descripcion,p_estado_region:payload.estado_region,p_municipio:payload.municipio,p_colonia:payload.colonia,p_presupuesto_min:payload.presupuesto_min,p_presupuesto_max:payload.presupuesto_max,p_fecha_necesaria:payload.fecha_necesaria,p_urgencia:payload.urgencia,p_acepta_compartir_contacto:true
  });
  submitButton.disabled=false;submitButton.innerHTML='Publicar y recibir opciones <span>→</span>';
  if(error){
    console.error(error);const text=String(error.message||'');
    if(/Límite alcanzado/i.test(text))showAlert('Ya publicaste 3 solicitudes con este WhatsApp en las últimas 24 horas. Intenta de nuevo mañana.');
    else if(/af_publicar_necesidad(?:_v2)?|schema cache|permission denied|does not exist/i.test(text))showAlert('El motor MATCH todavía no está disponible en esta publicación. Actualiza los archivos y vuelve a intentar.');
    else showAlert('No pudimos publicar la solicitud. Revisa los datos e inténtalo nuevamente.');
    return;
  }
  const result=Array.isArray(data)?data[0]:data;const token=result?.tracking_token;
  rememberToken(token);
  if(trackingLink&&token)trackingLink.href=trackingUrl(token);
  form.reset();setDefaultLocation();formPanel.hidden=true;successPanel.hidden=false;successPanel.scrollIntoView({behavior:'smooth',block:'center'});
  refreshLastNeed();loadActivity();
}
function resetForm(){successPanel.hidden=true;formPanel.hidden=false;clearAlert();formPanel.scrollIntoView({behavior:'smooth',block:'center'});}
function bindIndexLinks(){document.querySelectorAll('a[href="#lo-necesito"],button[data-home-need-open]').forEach(control=>control.addEventListener('click',event=>{if(control.tagName==='BUTTON')event.preventDefault();window.setTimeout(()=>section?.scrollIntoView({behavior:'smooth',block:'start'}),0);}));}
function relativeTime(value){
  const ms=Date.now()-new Date(value).getTime();if(!Number.isFinite(ms))return'';const min=Math.max(0,Math.floor(ms/60000));if(min<1)return'ahora';if(min<60)return`hace ${min} min`;const h=Math.floor(min/60);if(h<24)return`hace ${h} h`;const d=Math.floor(h/24);return`hace ${d} d`;
}
function activityState(item){
  if(item.respuestas_count>0)return`✓ ${item.respuestas_count} respuesta${item.respuestas_count===1?'':'s'}`;
  if(item.sin_cobertura)return'👻 Aliados buscando proveedor';
  if(item.matches_count>0)return`⚡ ${item.matches_count} negocio${item.matches_count===1?'':'s'} avisado${item.matches_count===1?'':'s'}`;
  return'⌕ Buscando coincidencias';
}
async function loadActivity(){
  if(!activityList||!supabase)return;
  try{
    const {data,error}=await supabase.rpc('af_actividad_publica',{p_limite:8});if(error)throw error;
    const rows=data||[];const replies=rows.reduce((sum,item)=>sum+Number(item.respuestas_count||0),0);
    if(activityTotal)activityTotal.textContent=String(rows.length);if(activityReplies)activityReplies.textContent=String(replies);
    if(activityStatus)activityStatus.textContent=rows.length?'Actividad real de solicitudes abiertas':'Esperando la primera solicitud real';
    if(!rows.length){activityList.innerHTML='<div class="home-activity-empty"><span>👻</span><div><strong>Aún no hay solicitudes reales publicadas.</strong><p>La primera aparecerá aquí en cuanto alguien use “Lo necesito”. No mostramos actividad inventada.</p></div></div>';return;}
    activityList.innerHTML=rows.map(item=>`<article class="home-activity-item"><div class="home-activity-pulse"></div><div><div class="home-activity-top"><span>${esc(item.categoria)}</span><small>${esc(relativeTime(item.created_at))}</small></div><strong>${esc(item.titulo)}</strong><p>${esc(item.municipio)} · ${esc(item.estado_region)}</p><em class="${item.respuestas_count>0?'done':item.sin_cobertura?'searching':''}">${esc(activityState(item))}</em></div></article>`).join('');
  }catch(error){console.warn('No fue posible cargar actividad pública:',error);if(activityStatus)activityStatus.textContent='Actividad temporalmente no disponible';}
}
async function refreshLastNeed(){
  const token=localStorage.getItem(STORAGE_TOKEN);if(!token||!lastNeedBanner||!lastNeedLink||!supabase)return;
  try{const {data,error}=await supabase.rpc('af_estado_necesidad',{p_token:token});if(error||!data)return;lastNeedBanner.hidden=false;lastNeedLink.href=trackingUrl(token);const label=lastNeedBanner.querySelector('[data-last-need-copy]');if(label)label.textContent=`${data.titulo} · ${data.respuestas_count||0} respuesta${Number(data.respuestas_count||0)===1?'':'s'}`;}catch{}
}

async function setupBusinessEntry(){
  if(!businessButton||!businessStatus)return;
  businessButton.href='login.html?return=oportunidades.html';businessStatus.textContent='Si tienes un negocio, inicia sesión para recibir oportunidades que coincidan contigo.';businessButton.textContent='Entrar a oportunidades →';if(businessMeta)businessMeta.textContent='El motor MATCH prioriza categoría y cercanía, y te avisa cuando haya una coincidencia.';
  if(!supabase)return;
  try{
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    const [{data:profile},{data:memberships,error:membershipError}]=await Promise.all([supabase.from('perfiles').select('rol,activo').eq('id',user.id).maybeSingle(),supabase.from('miembros_negocio').select('negocio_id,activo,negocios(id,nombre,estado_operativo)').eq('perfil_id',user.id).eq('activo',true)]);if(membershipError)throw membershipError;
    const activeMembership=(memberships||[]).find(row=>row.negocios&&!['suspendido','eliminacion_programada'].includes(row.negocios.estado_operativo));const isAdmin=profile?.rol==='administrador'&&profile?.activo===true;
    if(!activeMembership&&!isAdmin){businessStatus.textContent='Tu sesión está activa, pero todavía no encontramos un negocio habilitado para recibir matches.';businessButton.href='panel.html';businessButton.textContent='Completar mi negocio →';return;}
    if(activeMembership){
      const biz=activeMembership.negocios;let countLabel='MATCH está listo para avisarte.';
      try{const {count,error}=await supabase.from('matches_necesidad').select('id',{count:'exact',head:true}).eq('negocio_id',biz.id).in('estado',['notificado','visto']);if(!error&&Number.isFinite(count))countLabel=count?`${count} oportunidad${count===1?'':'es'} asignada${count===1?'':'s'} ahora.`:'No tienes matches nuevos ahora; te avisaremos cuando llegue uno.';}catch{}
      businessStatus.textContent=`${biz.nombre}: ${countLabel}`;businessButton.href=`oportunidades.html?business=${encodeURIComponent(biz.id)}`;businessButton.textContent='Ver mis oportunidades →';if(businessMeta)businessMeta.textContent='Las nuevas oportunidades aparecen en tu campana en tiempo real.';
    }else if(isAdmin){businessStatus.textContent='Sesión administrativa activa. Revisa demanda sin cobertura y oportunidades.';businessButton.href='demanda.html';businessButton.textContent='Ver demanda de la red →';}
  }catch(error){console.warn('No se pudo personalizar el acceso a oportunidades:',error);}
}

if(form){
  form.addEventListener('submit',publishNeed);anotherButton?.addEventListener('click',resetForm);setDefaultLocation();loadCategories();bindIndexLinks();setupBusinessEntry();refreshLastNeed();loadActivity();window.setInterval(loadActivity,30000);
}
