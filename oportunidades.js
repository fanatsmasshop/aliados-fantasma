import { supabase } from './supabase-client.js?v=20260720-600';
import { getActiveContext, setActiveContext } from './auth-context.js?v=20260724-CTX-LOCK-002';

const grid=document.querySelector('#opp-grid'),loading=document.querySelector('#opp-loading'),empty=document.querySelector('#opp-empty'),summary=document.querySelector('#opp-summary'),businessName=document.querySelector('#need-business-name');
const filters={search:document.querySelector('#opp-search'),category:document.querySelector('#opp-category'),location:document.querySelector('#opp-location'),urgency:document.querySelector('#opp-urgency')};
const modal=document.querySelector('#quote-modal'),quoteForm=document.querySelector('#quote-form'),quoteAlert=document.querySelector('#quote-alert');
const bell=document.querySelector('#opp-notification-bell'),bellBadge=document.querySelector('#opp-notification-badge'),bellPanel=document.querySelector('#opp-notification-panel'),bellList=document.querySelector('#opp-notification-list');
let user=null,business=null,memberships=[],opportunities=[],responses=new Map(),matches=new Map(),notifications=[],recommendedFirst=true,realtimeChannel=null;
const params=new URLSearchParams(location.search),focusNeed=params.get('need')||'';
const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const money=v=>v==null||v===''?'':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v));
const dateFmt=v=>v?new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short'}).format(new Date(`${v}T12:00:00`)):'';
function waPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.length===10)d=`52${d}`;if(d.startsWith('521')&&d.length===13)d=`52${d.slice(3)}`;return d;}
function urgencyLabel(v){return({hoy:'Lo necesita hoy','24_horas':'En 24 horas',esta_semana:'Esta semana',normal:'Sin prisa'})[v]||'Sin prisa';}
function budgetLabel(i){if(i.presupuesto_min!=null&&i.presupuesto_max!=null)return`${money(i.presupuesto_min)}–${money(i.presupuesto_max)}`;if(i.presupuesto_max!=null)return`Hasta ${money(i.presupuesto_max)}`;if(i.presupuesto_min!=null)return`Desde ${money(i.presupuesto_min)}`;return'A convenir';}
function relativeTime(v){const m=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/60000));if(m<1)return'ahora';if(m<60)return`hace ${m} min`;const h=Math.floor(m/60);if(h<24)return`hace ${h} h`;return`hace ${Math.floor(h/24)} d`;}
function matchFor(i){return matches.get(i.id)||null;}
function relevance(i){const m=matchFor(i);if(m)return Number(m.score||0);let s=0;if(business?.categoria_id&&i.categoria_id===business.categoria_id)s+=45;if(norm(i.estado_region)===norm(business?.estado_region))s+=10;if(norm(i.municipio)===norm(business?.municipio))s+=25;if(i.urgencia==='hoy')s+=8;else if(i.urgencia==='24_horas')s+=5;return s;}

async function requireBusiness(){
 if(!supabase){location.replace('login.html');return false;}const {data:{user:currentUser}}=await supabase.auth.getUser();if(!currentUser){location.replace(`login.html?return=${encodeURIComponent(location.pathname.split('/').pop()+location.search)}`);return false;}user=currentUser;
 const {data,error}=await supabase.from('miembros_negocio').select('negocio_id,rol,activo,negocios(id,nombre,slug,categoria_id,estado_region,municipio,localidad,activo,estado,estado_operativo)').eq('perfil_id',user.id).eq('activo',true);if(error)throw error;memberships=(data||[]).filter(r=>r.negocios&&r.negocios.activo!==false&&!['suspendido','eliminacion_programada'].includes(r.negocios.estado_operativo));if(!memberships.length){location.replace('login.html?choose=1');return false;}
 const context=getActiveContext(user.id);const preferred=params.get('business')||context?.businessId||localStorage.getItem('af_owner_business_id')||'';const membership=memberships.find(r=>r.negocio_id===preferred)||memberships[0];business=membership.negocios;localStorage.setItem('af_owner_business_id',business.id);if(!context||context.type!=='owner'||context.businessId!==business.id){try{setActiveContext(user.id,{type:'owner',businessId:business.id});}catch{}}
 businessName.textContent=business.nombre||'Mi negocio';return true;
}

async function loadData({silent=false}={}){
 if(!silent){loading.style.display='flex';grid.style.display='none';empty.classList.remove('show');}
 const {data,error}=await supabase.rpc('af_oportunidades_para_negocio',{p_negocio:business.id});
 if(error)throw error;
 opportunities=(data||[]).map(row=>({
   id:row.id,categoria_id:row.categoria_id,categoria_texto:row.categoria_texto,titulo:row.titulo,descripcion:row.descripcion,
   estado_region:row.estado_region,municipio:row.municipio,colonia:row.colonia,presupuesto_min:row.presupuesto_min,presupuesto_max:row.presupuesto_max,
   fecha_necesaria:row.fecha_necesaria,urgencia:row.urgencia,created_at:row.created_at,
   match_id:row.match_id,score:row.score,ola:row.ola,razones:row.razones,estado_match:row.estado_match,visto_at:row.visto_at,respondido_at:row.respondido_at,
   turno_expires_at:row.turno_expires_at,estado_turno:row.estado_turno,
   respuesta_id:row.respuesta_id,precio_estimado:row.precio_estimado,tiempo_estimado:row.tiempo_estimado,mensaje:row.mensaje
 }));
 matches=new Map(opportunities.map(i=>[i.id,{id:i.match_id,score:i.score,ola:i.ola,razones:i.razones,estado:i.estado_match,visto_at:i.visto_at,respondido_at:i.respondido_at}]));
 responses=new Map(opportunities.filter(i=>i.respuesta_id).map(i=>[i.id,{id:i.respuesta_id,precio_estimado:i.precio_estimado,tiempo_estimado:i.tiempo_estimado,mensaje:i.mensaje}]));
 buildCategoryFilter();render();await markMatchesSeen();
 if(focusNeed)setTimeout(()=>document.querySelector(`[data-need-id="${CSS.escape(focusNeed)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),100);
}
async function markMatchesSeen(){
 const ids=[...matches.values()].filter(m=>m?.id&&m.estado==='notificado').map(m=>m.id);if(!ids.length)return;const now=new Date().toISOString();
 const {error}=await supabase.from('matches_necesidad').update({estado:'visto',visto_at:now,updated_at:now}).in('id',ids).eq('negocio_id',business.id);
 if(!error)[...matches.values()].forEach(m=>{if(ids.includes(m.id)){m.estado='visto';m.visto_at=now;}});
}
function buildCategoryFilter(){const current=filters.category.value;const unique=[...new Map(opportunities.map(i=>[i.categoria_id||i.categoria_texto,{id:i.categoria_id||'',name:i.categoria_texto}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));filters.category.innerHTML='<option value="">Todas las categorías</option>'+unique.map(i=>`<option value="${esc(i.id||`name:${i.name}`)}">${esc(i.name)}</option>`).join('');if([...filters.category.options].some(o=>o.value===current))filters.category.value=current;}
function filteredItems(){
 const q=norm(filters.search.value),cat=filters.category.value,loc=filters.location.value,urg=filters.urgency.value;
 let list=opportunities.filter(i=>{
if(q&&!norm(`${i.titulo} ${i.descripcion} ${i.categoria_texto} ${i.estado_region} ${i.municipio} ${i.colonia||''}`).includes(q))return false;
  if(cat){if(cat.startsWith('name:')){if(norm(i.categoria_texto)!==norm(cat.slice(5)))return false;}else if(String(i.categoria_id||'')!==cat)return false;}
  if(loc==='state'&&norm(i.estado_region)!==norm(business.estado_region))return false;if(loc==='municipality'&&(norm(i.estado_region)!==norm(business.estado_region)||norm(i.municipio)!==norm(business.municipio)))return false;if(urg&&i.urgencia!==urg)return false;return true;
 });
 if(recommendedFirst)list.sort((a,b)=>relevance(b)-relevance(a)||new Date(b.created_at)-new Date(a.created_at));return list;
}
function renderStats(){const assigned=[...matches.values()].filter(m=>m&&m.estado!=='expirado');document.querySelector('#stat-matched').textContent=assigned.length;document.querySelector('#stat-new').textContent=assigned.filter(m=>m.estado==='notificado'||m.estado==='visto').length;document.querySelector('#stat-contacted').textContent=responses.size;document.querySelector('#stat-open').textContent=opportunities.length;}
function reasonsMarkup(m){if(!m)return'';const rs=(Array.isArray(m.razones)?m.razones:[]).filter(Boolean);return`<div class="need-match-reasons"><span class="need-match-score">MATCH ${esc(m.score)}</span><span>ola ${esc(m.ola)}</span>${rs.map(r=>`<span>${esc(r)}</span>`).join('')}</div>`;}
function card(item){
 const m=matchFor(item),contacted=responses.has(item.id),place=[item.colonia,item.municipio,item.estado_region].filter(Boolean).join(' · '),urgent=['hoy','24_horas'].includes(item.urgencia),focused=item.id===focusNeed;
 return`<article class="need-card need-opportunity relevant ${focused?'focus-match':''}" data-need-id="${esc(item.id)}"><div class="need-opportunity-meta"><span class="need-tag match">✦ MATCH ${esc(m?.score||0)}%</span><span class="need-tag">${esc(item.categoria_texto||'Solicitud')}</span><span class="need-tag ${urgent?'hot':''}">${esc(urgencyLabel(item.urgencia))}</span></div><div class="need-opportunity-head"><h3>${esc(item.titulo)}</h3><small>${esc(relativeTime(item.created_at))}</small></div><p>${esc(item.descripcion)}</p>${reasonsMarkup(m)}<div class="need-opportunity-details"><span>⌖ <b>${esc(place)}</b></span><span>$ <b>${esc(budgetLabel(item))}</b></span>${item.fecha_necesaria?`<span>◷ <b>${esc(dateFmt(item.fecha_necesaria))}</b></span>`:''}</div><div class="need-opportunity-actions"><span class="need-contacted">${contacted?'✓ Ya respondiste':'🔒 WhatsApp protegido hasta responder'}</span><button class="need-button small ${contacted?'secondary':'primary'}" type="button" data-quote="${esc(item.id)}">${contacted?'Actualizar propuesta':'Puedo resolver esto →'}</button></div></article>`;
}
function render(){renderStats();const list=filteredItems();loading.style.display='none';summary.textContent=`${list.length} oportunidad${list.length===1?'':'es'} asignada${list.length===1?'':'s'} por MATCH a ${business.nombre}`;grid.innerHTML=list.map(card).join('');empty.classList.toggle('show',!list.length);grid.style.display=list.length?'':'none';document.querySelectorAll('[data-quote]').forEach(b=>b.addEventListener('click',()=>openQuote(b.dataset.quote)));}
function openQuote(id){const item=opportunities.find(r=>r.id===id);if(!item)return;const existing=responses.get(id);document.querySelector('#quote-need-id').value=id;document.querySelector('#quote-request').textContent=`${item.titulo} · ${item.municipio}`;document.querySelector('#quote-price').value=existing?.precio_estimado??'';document.querySelector('#quote-time').value=existing?.tiempo_estimado??'';document.querySelector('#quote-message').value=existing?.mensaje||`Hola, vi tu solicitud en Aliados Fantasma y creo que ${business.nombre} puede ayudarte.`;quoteAlert.className='need-alert';quoteAlert.textContent='';modal.classList.add('show');setTimeout(()=>document.querySelector('#quote-message').focus(),50);}
function closeQuote(){modal.classList.remove('show');}
document.querySelector('#quote-close').addEventListener('click',closeQuote);document.querySelector('#quote-cancel').addEventListener('click',closeQuote);modal.addEventListener('click',e=>{if(e.target===modal)closeQuote();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeQuote();bellPanel.hidden=true;}});
quoteForm.addEventListener('submit',async e=>{
 e.preventDefault();const needId=document.querySelector('#quote-need-id').value,item=opportunities.find(r=>r.id===needId);if(!item)return;const message=document.querySelector('#quote-message').value.trim();if(message.length<3){quoteAlert.textContent='Escribe un mensaje para el cliente.';quoteAlert.className='need-alert show error';return;}
 const priceRaw=document.querySelector('#quote-price').value.trim(),time=document.querySelector('#quote-time').value.trim();const button=document.querySelector('#quote-submit');button.disabled=true;button.textContent='Registrando y autorizando contacto…';
 const {data,error}=await supabase.rpc('af_responder_y_contactar',{p_necesidad:needId,p_negocio:business.id,p_precio:priceRaw?Number(priceRaw):null,p_tiempo:time||null,p_mensaje:message});button.disabled=false;button.textContent='Registrar y abrir WhatsApp →';
 if(error){console.error(error);quoteAlert.textContent=String(error.message||'').includes('autorizó')?'El cliente no autorizó compartir su contacto.':'No pudimos registrar la propuesta. Intenta de nuevo.';quoteAlert.className='need-alert show error';return;}
 const contact=Array.isArray(data)?data[0]:data;if(!contact?.whatsapp){quoteAlert.textContent='La propuesta se registró, pero no pudimos obtener el contacto autorizado.';quoteAlert.className='need-alert show error';return;}
 responses.set(needId,{id:item.respuesta_id||'ok',precio_estimado:priceRaw?Number(priceRaw):null,tiempo_estimado:time||null,mensaje:message});const m=matches.get(needId);if(m){m.estado='respondido';m.respondido_at=new Date().toISOString();}render();closeQuote();
 const priceText=priceRaw?`\nPrecio aproximado: ${money(Number(priceRaw))}`:'',timeText=time?`\nTiempo estimado: ${time}`:'';const text=`Hola ${contact.nombre_cliente||''}. Soy ${business.nombre} y vi tu solicitud “${item.titulo}” en Aliados Fantasma.\n\n${message}${priceText}${timeText}\n\nPodemos revisar los detalles por aquí.`;window.open(`https://wa.me/${waPhone(contact.whatsapp)}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
});

function notificationIcon(type=''){return type.includes('urgente')?'🔥':type.includes('oportunidad')?'👻':type.includes('demanda')?'🚨':'🔔';}
function updateBell(){const count=notifications.filter(n=>!n.leida).length;bellBadge.textContent=count>99?'99+':String(count);bellBadge.hidden=count===0;}
function renderNotifications(){if(!bellList)return;if(!notifications.length){bellList.innerHTML='<div class="notification-empty"><strong>Sin avisos nuevos</strong><p>Cuando MATCH encuentre una oportunidad para tu negocio aparecerá aquí.</p></div>';return;}bellList.innerHTML=notifications.slice(0,30).map(n=>`<button class="opp-notification-item ${n.leida?'':'unread'}" type="button" data-note="${esc(n.id)}"><strong>${notificationIcon(n.tipo)} ${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p><small>${esc(relativeTime(n.created_at))}</small></button>`).join('');bellList.querySelectorAll('[data-note]').forEach(btn=>btn.addEventListener('click',()=>openNotification(btn.dataset.note)));}
async function loadNotifications(){const {data,error}=await supabase.from('notificaciones_plataforma').select('id,tipo,titulo,mensaje,leida,importante,created_at,accion_url,metadata').eq('usuario_id',user.id).order('created_at',{ascending:false}).limit(50);if(error)throw error;notifications=data||[];renderNotifications();updateBell();}
async function openNotification(id){const n=notifications.find(x=>x.id===id);if(!n)return;if(!n.leida){await supabase.from('notificaciones_plataforma').update({leida:true,leida_at:new Date().toISOString()}).eq('id',id).eq('usuario_id',user.id);n.leida=true;renderNotifications();updateBell();}bellPanel.hidden=true;if(n.accion_url)location.href=n.accion_url;}
function showLiveToast(n){document.querySelector('.opp-live-toast')?.remove();const t=document.createElement('button');t.type='button';t.className='opp-live-toast';t.innerHTML=`<strong>${notificationIcon(n.tipo)} ${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p>`;t.onclick=()=>openNotification(n.id);document.body.appendChild(t);setTimeout(()=>t.remove(),9000);}
function subscribeRealtime(){if(realtimeChannel||!user)return;realtimeChannel=supabase.channel(`aliados-notifications-${user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notificaciones_plataforma',filter:`usuario_id=eq.${user.id}`},async payload=>{const n=payload.new;if(!notifications.some(x=>x.id===n.id))notifications.unshift(n);renderNotifications();updateBell();showLiveToast(n);if(String(n.tipo||'').includes('oportunidad'))await loadData({silent:true});}).subscribe();}

Object.values(filters).forEach(c=>c.addEventListener(c.tagName==='INPUT'?'input':'change',render));document.querySelector('#opp-clear').addEventListener('click',()=>{filters.search.value='';filters.category.value='';filters.location.value='';filters.urgency.value='';recommendedFirst=true;render();});document.querySelector('#opp-recommended').addEventListener('click',e=>{recommendedFirst=!recommendedFirst;e.currentTarget.textContent=recommendedFirst?'Primero las recomendadas':'Orden más reciente';render();});document.querySelector('#opp-scope')?.remove();
bell?.addEventListener('click',()=>{bellPanel.hidden=!bellPanel.hidden;});document.querySelector('#opp-read-all')?.addEventListener('click',async()=>{const ids=notifications.filter(n=>!n.leida).map(n=>n.id);if(!ids.length)return;const now=new Date().toISOString();const {error}=await supabase.from('notificaciones_plataforma').update({leida:true,leida_at:now}).in('id',ids).eq('usuario_id',user.id);if(!error){notifications.forEach(n=>{if(ids.includes(n.id))n.leida=true;});renderNotifications();updateBell();}});
document.addEventListener('click',e=>{if(bellPanel&&!bellPanel.hidden&&!e.target.closest('.opp-notification-wrap'))bellPanel.hidden=true;});window.addEventListener('beforeunload',()=>{if(realtimeChannel)supabase.removeChannel(realtimeChannel);});

(async function init(){try{const ok=await requireBusiness();if(!ok)return;await Promise.all([loadData(),loadNotifications()]);subscribeRealtime();}catch(error){console.error(error);loading.innerHTML='<strong>No pudimos cargar las oportunidades.</strong><br><span style="color:#9ca7b8">Actualiza la página. Si persiste, revisa tu conexión e inténtalo de nuevo.</span>';summary.textContent='Error al cargar';}})();
