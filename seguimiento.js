import { supabase } from './supabase-client.js?v=20260720-600';
const qs=new URLSearchParams(location.search);const token=qs.get('t')||localStorage.getItem('af_last_need_token')||'';
const loading=document.querySelector('#tracking-loading'),content=document.querySelector('#tracking-content'),missing=document.querySelector('#tracking-missing'),alertBox=document.querySelector('#tracking-alert');
let current=null, timer=null;
const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const money=v=>v==null||v===''?'':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v));
function setAlert(msg,type='error'){alertBox.textContent=msg;alertBox.className=`need-alert show ${type}`;}
function step(id,state){const el=document.querySelector(id);el.classList.toggle('done',state==='done');el.classList.toggle('active',state==='active');}
function render(data){
 current=data;loading.hidden=true;missing.hidden=true;content.hidden=false;
 document.querySelector('#tracking-category').textContent=data.categoria||'SOLICITUD';document.querySelector('#tracking-title').textContent=data.titulo||'Solicitud';document.querySelector('#tracking-location').textContent=[data.municipio,data.estado_region].filter(Boolean).join(' · ');
 const matches=Number(data.matches_count||0),replies=Number(data.respuestas_count||0),closed=data.estado==='cerrada';
 let pill='Buscando negocios',summary='Aliados está comparando tu solicitud con negocios registrados.';
 if(data.sin_cobertura&&!replies){pill='Aliados buscando proveedor';summary='No hubo cobertura suficiente dentro de la red. Aliados la marcó para búsqueda de proveedor y administración puede captar una opción para tu necesidad.';}
 else if(replies){pill=`${replies} propuesta${replies===1?'':'s'}`;summary=`Ya recibiste ${replies} propuesta${replies===1?'':'s'}. Revisa las opciones y contacta al negocio que te convenga.`;}
 else if(matches){pill=`${matches} negocio${matches===1?'':'s'} avisado${matches===1?'':'s'}`;summary=`El motor MATCH ya avisó a ${matches} negocio${matches===1?'':'s'} compatible${matches===1?'':'s'}. Si nadie responde, Aliados ampliará la búsqueda automáticamente.`;}
 if(closed){pill='Solicitud cerrada';summary=data.resuelta_at?'Marcaste esta necesidad como resuelta.':'Esta solicitud ya está cerrada.';}
 document.querySelector('#tracking-pill').textContent=pill;document.querySelector('#tracking-summary').innerHTML=`<strong>${esc(pill)}</strong><p style="margin:6px 0 0;color:#9ca7b8">${esc(summary)}</p>`;
 step('#track-step-published','done');step('#track-step-matched',matches>0||replies>0||data.sin_cobertura?'done':'active');step('#track-step-replied',replies>0?'done':matches>0?'active':'');step('#track-step-solved',closed?'done':replies>0?'active':'');
 const rows=Array.isArray(data.respuestas)?data.respuestas:[];document.querySelector('#tracking-reply-count').textContent=`${rows.length} recibida${rows.length===1?'':'s'}`;
 const box=document.querySelector('#tracking-replies');box.innerHTML=rows.length?rows.map(r=>`<article class="tracking-reply"><div class="tracking-reply-top"><div><strong>${esc(r.negocio||'Negocio Aliado')}</strong>${r.tiempo_estimado?`<small style="display:block;color:#9ca7b8;margin-top:3px">${esc(r.tiempo_estimado)}</small>`:''}</div>${r.precio_estimado!=null?`<strong style="color:#bdfbe0">${esc(money(r.precio_estimado))}</strong>`:''}</div><p>${esc(r.mensaje||'El negocio indicó que puede ayudarte.')}</p>${r.slug?`<a class="need-button small secondary" href="perfil.html?slug=${encodeURIComponent(r.slug)}">Ver negocio →</a>`:''}</article>`).join(''):'<div class="home-activity-empty"><span>◌</span><div><strong>Todavía no hay propuestas.</strong><p>No necesitas refrescar: esta pantalla se actualiza automáticamente.</p></div></div>';
 const resolve=document.querySelector('#tracking-resolve');resolve.disabled=closed;resolve.textContent=closed?'✓ Solicitud cerrada':'✓ Ya encontré lo que necesitaba';
}
async function load(){
 if(!token||!supabase){loading.hidden=true;missing.hidden=false;return;}
 try{const {data,error}=await supabase.rpc('af_estado_necesidad',{p_token:token});if(error)throw error;if(!data){loading.hidden=true;missing.hidden=false;return;}render(data);}catch(e){console.error(e);loading.hidden=true;setAlert('No pudimos consultar el estado en este momento.');}
}
document.querySelector('#tracking-resolve').addEventListener('click',async()=>{
 if(!token||!current||current.estado==='cerrada')return;const btn=document.querySelector('#tracking-resolve');btn.disabled=true;btn.textContent='Cerrando…';
 const {data,error}=await supabase.rpc('af_cerrar_necesidad',{p_token:token,p_resuelta:true});if(error){btn.disabled=false;btn.textContent='✓ Ya encontré lo que necesitaba';setAlert('No pudimos cerrar la solicitud. Intenta nuevamente.');return;}if(data)await load();
});
load();timer=setInterval(load,20000);window.addEventListener('beforeunload',()=>clearInterval(timer));
