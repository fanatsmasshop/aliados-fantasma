import { supabase } from './supabase-client.js?v=20260720-600';
import { getActiveContext, setActiveContext } from './auth-context.js?v=20260724-CTX-LOCK-002';

const grid = document.querySelector('#opp-grid');
const loading = document.querySelector('#opp-loading');
const empty = document.querySelector('#opp-empty');
const summary = document.querySelector('#opp-summary');
const businessName = document.querySelector('#need-business-name');
const filters = {
  search: document.querySelector('#opp-search'),
  category: document.querySelector('#opp-category'),
  location: document.querySelector('#opp-location'),
  urgency: document.querySelector('#opp-urgency')
};
const modal = document.querySelector('#quote-modal');
const quoteForm = document.querySelector('#quote-form');
const quoteAlert = document.querySelector('#quote-alert');

let user = null;
let business = null;
let memberships = [];
let opportunities = [];
let responses = new Map();
let recommendedFirst = true;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const money = value => value == null || value === '' ? '' : new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(value));
const dateFmt = value => value ? new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`)) : '';

function waPhone(value){
  let digits = String(value || '').replace(/\D/g,'');
  if(digits.length === 10) digits = `52${digits}`;
  if(digits.startsWith('521') && digits.length === 13) digits = `52${digits.slice(3)}`;
  return digits;
}

function urgencyLabel(value){
  return ({hoy:'Lo necesita hoy', '24_horas':'En 24 horas', esta_semana:'Esta semana', normal:'Sin prisa'})[value] || 'Sin prisa';
}

function budgetLabel(item){
  if(item.presupuesto_min != null && item.presupuesto_max != null) return `${money(item.presupuesto_min)}–${money(item.presupuesto_max)}`;
  if(item.presupuesto_max != null) return `Hasta ${money(item.presupuesto_max)}`;
  if(item.presupuesto_min != null) return `Desde ${money(item.presupuesto_min)}`;
  return 'A convenir';
}

function relevance(item){
  let score = 0;
  if(business?.categoria_id && item.categoria_id === business.categoria_id) score += 50;
  if(norm(item.estado_region) && norm(item.estado_region) === norm(business?.estado_region)) score += 25;
  if(norm(item.municipio) && norm(item.municipio) === norm(business?.municipio)) score += 25;
  if(item.urgencia === 'hoy') score += 8;
  else if(item.urgencia === '24_horas') score += 5;
  const ageHours = (Date.now() - new Date(item.created_at).getTime()) / 36e5;
  if(ageHours < 24) score += 4;
  return score;
}

async function requireBusiness(){
  if(!supabase){ location.replace('login.html'); return false; }
  const {data:{user:currentUser}} = await supabase.auth.getUser();
  if(!currentUser){ location.replace(`login.html?return=${encodeURIComponent('oportunidades.html')}`); return false; }
  user = currentUser;

  const {data,error} = await supabase
    .from('miembros_negocio')
    .select('negocio_id,rol,activo,negocios(id,nombre,slug,categoria_id,estado_region,municipio,localidad,activo,estado_operativo)')
    .eq('perfil_id',user.id)
    .eq('activo',true);
  if(error) throw error;
  memberships = (data || []).filter(row => row.negocios);
  if(!memberships.length){ location.replace('login.html?choose=1'); return false; }

  const params = new URLSearchParams(location.search);
  const context = getActiveContext(user.id);
  const preferred = params.get('business') || context?.businessId || localStorage.getItem('af_owner_business_id') || '';
  const membership = memberships.find(row => row.negocio_id === preferred) || memberships[0];
  business = membership.negocios;
  localStorage.setItem('af_owner_business_id',business.id);
  if(!context || context.type !== 'owner' || context.businessId !== business.id){
    try{ setActiveContext(user.id,{type:'owner',businessId:business.id}); }catch{}
  }
  businessName.textContent = business.nombre || 'Mi negocio';
  return true;
}

async function loadData(){
  const now = new Date().toISOString();
  const [needsResult,responsesResult] = await Promise.all([
    supabase.from('necesidades').select('*').eq('estado','abierta').gt('expires_at',now).order('created_at',{ascending:false}).limit(200),
    supabase.from('respuestas_necesidad').select('id,necesidad_id,negocio_id,precio_estimado,tiempo_estimado,mensaje,estado,contactado_at,updated_at').eq('negocio_id',business.id)
  ]);
  if(needsResult.error) throw needsResult.error;
  if(responsesResult.error) throw responsesResult.error;
  opportunities = needsResult.data || [];
  responses = new Map((responsesResult.data || []).map(row => [row.necesidad_id,row]));
  buildCategoryFilter();
  render();
}

function buildCategoryFilter(){
  const current = filters.category.value;
  const unique = [...new Map(opportunities.map(item => [item.categoria_id || item.categoria_texto,{id:item.categoria_id || '',name:item.categoria_texto}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
  filters.category.innerHTML = '<option value="">Todas las categorías</option>' + unique.map(item => `<option value="${esc(item.id || `name:${item.name}`)}">${esc(item.name)}</option>`).join('');
  if([...filters.category.options].some(option => option.value === current)) filters.category.value = current;
}

function filteredItems(){
  const q = norm(filters.search.value);
  const category = filters.category.value;
  const location = filters.location.value;
  const urgency = filters.urgency.value;

  let list = opportunities.filter(item => {
    if(q && !norm(`${item.titulo} ${item.descripcion} ${item.categoria_texto} ${item.estado_region} ${item.municipio} ${item.colonia || ''}`).includes(q)) return false;
    if(category){
      if(category.startsWith('name:')){ if(norm(item.categoria_texto) !== norm(category.slice(5))) return false; }
      else if(String(item.categoria_id || '') !== category) return false;
    }
    if(location === 'state' && norm(item.estado_region) !== norm(business.estado_region)) return false;
    if(location === 'municipality' && (norm(item.estado_region) !== norm(business.estado_region) || norm(item.municipio) !== norm(business.municipio))) return false;
    if(urgency && item.urgencia !== urgency) return false;
    return true;
  });

  if(recommendedFirst){
    list.sort((a,b) => relevance(b)-relevance(a) || new Date(b.created_at)-new Date(a.created_at));
  }
  return list;
}

function renderStats(){
  document.querySelector('#stat-open').textContent = opportunities.length;
  document.querySelector('#stat-state').textContent = opportunities.filter(item => norm(item.estado_region) === norm(business.estado_region)).length;
  document.querySelector('#stat-category').textContent = opportunities.filter(item => business.categoria_id && item.categoria_id === business.categoria_id).length;
  document.querySelector('#stat-contacted').textContent = responses.size;
}

function card(item){
  const score = relevance(item);
  const contacted = responses.has(item.id);
  const location = [item.colonia,item.municipio,item.estado_region].filter(Boolean).join(' · ');
  const urgent = ['hoy','24_horas'].includes(item.urgencia);
  return `<article class="need-card need-opportunity ${score >= 50 ? 'relevant' : ''}" data-need-id="${esc(item.id)}">
    <div class="need-opportunity-meta">
      ${score >= 50 ? '<span class="need-tag match">✦ RECOMENDADA</span>' : ''}
      <span class="need-tag">${esc(item.categoria_texto)}</span>
      <span class="need-tag ${urgent ? 'hot' : ''}">${esc(urgencyLabel(item.urgencia))}</span>
    </div>
    <div class="need-opportunity-head"><h3>${esc(item.titulo)}</h3></div>
    <p>${esc(item.descripcion)}</p>
    <div class="need-opportunity-details">
      <span>⌖ <b>${esc(location)}</b></span>
      <span>$ <b>${esc(budgetLabel(item))}</b></span>
      ${item.fecha_necesaria ? `<span>◷ <b>${esc(dateFmt(item.fecha_necesaria))}</b></span>` : ''}
    </div>
    <div class="need-opportunity-actions">
      <span class="need-contacted">${contacted ? '✓ Ya contactaste esta oportunidad' : 'Contacto autorizado por el cliente'}</span>
      <button class="need-button small ${contacted ? 'secondary' : 'primary'}" type="button" data-quote="${esc(item.id)}">${contacted ? 'Actualizar propuesta' : 'Cotizar por WhatsApp'}</button>
    </div>
  </article>`;
}

function render(){
  renderStats();
  const list = filteredItems();
  loading.style.display = 'none';
  summary.textContent = `${list.length} de ${opportunities.length} oportunidades`;
  grid.innerHTML = list.map(card).join('');
  empty.classList.toggle('show',!list.length);
  grid.style.display = list.length ? '' : 'none';
  document.querySelectorAll('[data-quote]').forEach(button => button.addEventListener('click',()=>openQuote(button.dataset.quote)));
}

function openQuote(id){
  const item = opportunities.find(row => row.id === id);
  if(!item) return;
  const existing = responses.get(id);
  document.querySelector('#quote-need-id').value = id;
  document.querySelector('#quote-request').textContent = `${item.titulo} · ${item.municipio}`;
  document.querySelector('#quote-price').value = existing?.precio_estimado ?? '';
  document.querySelector('#quote-time').value = existing?.tiempo_estimado ?? '';
  document.querySelector('#quote-message').value = existing?.mensaje || `Hola ${item.nombre_cliente}, vi tu solicitud en Aliados Fantasma y creo que podemos ayudarte.`;
  quoteAlert.className = 'need-alert';
  quoteAlert.textContent = '';
  modal.classList.add('show');
  setTimeout(()=>document.querySelector('#quote-message').focus(),50);
}

function closeQuote(){ modal.classList.remove('show'); }

document.querySelector('#quote-close').addEventListener('click',closeQuote);
document.querySelector('#quote-cancel').addEventListener('click',closeQuote);
modal.addEventListener('click',event=>{ if(event.target === modal) closeQuote(); });
document.addEventListener('keydown',event=>{ if(event.key === 'Escape') closeQuote(); });

quoteForm.addEventListener('submit',async event => {
  event.preventDefault();
  const needId = document.querySelector('#quote-need-id').value;
  const item = opportunities.find(row => row.id === needId);
  if(!item) return;
  const message = document.querySelector('#quote-message').value.trim();
  if(message.length < 3){
    quoteAlert.textContent = 'Escribe un mensaje para el cliente.';
    quoteAlert.className = 'need-alert show error';
    return;
  }
  const priceRaw = document.querySelector('#quote-price').value.trim();
  const time = document.querySelector('#quote-time').value.trim();
  const row = {
    necesidad_id: needId,
    negocio_id: business.id,
    respondido_por: user.id,
    precio_estimado: priceRaw ? Number(priceRaw) : null,
    tiempo_estimado: time || null,
    mensaje: message,
    estado: 'contactado',
    contactado_at: new Date().toISOString()
  };

  const button = document.querySelector('#quote-submit');
  button.disabled = true;
  button.textContent = 'Registrando…';
  const existing = responses.get(needId);
  let result;
  if(existing){
    result = await supabase.from('respuestas_necesidad').update(row).eq('id',existing.id).select().single();
  }else{
    result = await supabase.from('respuestas_necesidad').insert(row).select().single();
  }
  button.disabled = false;
  button.textContent = 'Registrar y abrir WhatsApp →';

  if(result.error){
    console.error(result.error);
    quoteAlert.textContent = /does not exist|schema cache/i.test(String(result.error.message||'')) ? 'Activa primero 078_lo_necesito.sql en Supabase.' : 'No pudimos registrar el contacto. Intenta de nuevo.';
    quoteAlert.className = 'need-alert show error';
    return;
  }

  responses.set(needId,result.data);
  render();
  closeQuote();

  const priceText = priceRaw ? `\nPrecio aproximado: ${money(Number(priceRaw))}` : '';
  const timeText = time ? `\nTiempo estimado: ${time}` : '';
  const text = `Hola ${item.nombre_cliente}. Soy ${business.nombre} y vi tu solicitud “${item.titulo}” en Aliados Fantasma.\n\n${message}${priceText}${timeText}\n\nPodemos revisar los detalles por aquí.`;
  const url = `https://wa.me/${waPhone(item.whatsapp)}?text=${encodeURIComponent(text)}`;
  window.open(url,'_blank','noopener,noreferrer');
});

Object.values(filters).forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change',render));
document.querySelector('#opp-clear').addEventListener('click',()=>{
  filters.search.value='';filters.category.value='';filters.location.value='';filters.urgency.value='';recommendedFirst=true;render();
});
document.querySelector('#opp-recommended').addEventListener('click',event=>{
  recommendedFirst = !recommendedFirst;
  event.currentTarget.textContent = recommendedFirst ? 'Primero las recomendadas' : 'Orden más reciente';
  render();
});

(async function init(){
  try{
    const ok = await requireBusiness();
    if(!ok) return;
    await loadData();
  }catch(error){
    console.error(error);
    loading.innerHTML = '<strong>No pudimos cargar las oportunidades.</strong><br><span style="color:#9ca7b8">Si todavía no activaste la función, ejecuta 078_lo_necesito.sql en Supabase.</span>';
    summary.textContent = 'Error al cargar';
  }
})();
