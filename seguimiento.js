import { supabase } from './supabase-client.js?v=20260720-600';
const qs=new URLSearchParams(location.search);const token=qs.get('t')||localStorage.getItem('af_last_need_token')||'';
const loading=document.querySelector('#tracking-loading'),content=document.querySelector('#tracking-content'),missing=document.querySelector('#tracking-missing'),alertBox=document.querySelector('#tracking-alert');
let current=null,timer=null;
const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const money=v=>v==null||v===''?'':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v));
function waPhone(v){let d=String(v||'').replace(/\D/g,'');if(d.length===10)d=`52${d}`;if(d.startsWith('521')&&d.length===13)d=`52${d.slice(3)}`;return d;}
function setAlert(msg,type='error'){alertBox.textContent=msg;alertBox.className=`need-alert show ${type}`;}
function statusCopy(data){
  if(data.estado==='cerrada')return['Solicitud cerrada','Esta solicitud ya terminó.'];
  if(data.opcion)return['Encontramos una opción','Un negocio confirmó que puede atenderte. Tú decides si quieres contactarlo.'];
  if(data.estado_busqueda==='consultando_negocio')return['Consultando un negocio','Aliados está preguntando de forma privada a una opción compatible. Si no puede atenderte, consultaremos la siguiente.'];
  if(data.estado_busqueda==='busqueda_manual')return['Seguimos buscando','No encontramos cobertura automática suficiente. Aliados seguirá buscando una opción.'];
  return['Buscando una opción','Puedes cerrar esta página. Guarda tu enlace y vuelve cuando quieras; Aliados sigue trabajando.'];
}
function render(data){
 current=data;loading.hidden=true;missing.hidden=true;content.hidden=false;
 document.querySelector('#tracking-category').textContent=data.categoria||'SOLICITUD';document.querySelector('#tracking-title').textContent=data.titulo||'Solicitud';document.querySelector('#tracking-location').textContent=[data.municipio,data.estado_region].filter(Boolean).join(' · ');
 const [pill,summary]=statusCopy(data);document.querySelector('#tracking-pill').textContent=pill;document.querySelector('#tracking-summary').innerHTML=`<div class="private-wait"><span class="pulse"></span><div><strong>${esc(pill)}</strong><p style="margin:6px 0 0;color:#9ca7b8">${esc(summary)}</p></div></div>`;
 const box=document.querySelector('#tracking-option');
 if(data.opcion){const o=data.opcion;const phone=waPhone(o.whatsapp);const price=o.precio_estimado!=null?money(o.precio_estimado):'';const text=`Hola, vi que ${o.negocio||'tu negocio'} puede ayudarme con mi solicitud “${data.titulo||''}” publicada en Aliados Fantasma.`;box.innerHTML=`<article class="private-option"><div class="private-badge">✓ Puede atenderte</div><div class="private-option-head" style="margin-top:14px"><div>${o.logo_url?`<img src="${esc(o.logo_url)}" alt="">`:''}</div><div style="flex:1"><h3 style="margin:0">${esc(o.negocio||'Negocio Aliado')}</h3>${o.tiempo_estimado?`<p class="need-muted" style="margin:4px 0 0">${esc(o.tiempo_estimado)}</p>`:''}</div>${price?`<strong>${esc(price)}</strong>`:''}</div>${o.mensaje?`<p style="margin:14px 0 0">${esc(o.mensaje)}</p>`:''}<div class="private-option-actions">${phone?`<a class="need-button primary" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}">Contactar por WhatsApp →</a>`:''}${o.slug?`<a class="need-button secondary" href="perfil.html?slug=${encodeURIComponent(o.slug)}">Ver negocio</a>`:''}</div><p class="need-muted" style="margin:12px 0 0">Tu número no fue compartido. La conversación comienza únicamente si tú pulsas “Contactar”.</p></article>`;}else box.innerHTML='';
 const resolve=document.querySelector('#tracking-resolve');resolve.disabled=data.estado==='cerrada';resolve.textContent=data.estado==='cerrada'?'✓ Solicitud cerrada':'✓ Ya lo resolví';
}
async function load(){if(!token||!supabase){loading.hidden=true;missing.hidden=false;return;}try{const {data,error}=await supabase.rpc('af_estado_necesidad',{p_token:token});if(error)throw error;if(!data){loading.hidden=true;missing.hidden=false;return;}render(data);}catch(e){console.error(e);loading.hidden=true;setAlert('No pudimos consultar tu solicitud en este momento.');}}
async function copyLink(){try{await navigator.clipboard.writeText(location.href);setAlert('Enlace privado copiado. Guárdalo para volver cuando quieras.','success');}catch{setAlert('Copia la dirección de esta página para guardar tu solicitud.','success');}}
async function shareLink(){if(navigator.share){try{await navigator.share({title:'Mi solicitud en Aliados Fantasma',text:'Mi enlace privado de seguimiento',url:location.href});return;}catch{}}copyLink();}
document.querySelector('#tracking-copy')?.addEventListener('click',copyLink);document.querySelector('#tracking-share')?.addEventListener('click',shareLink);
document.querySelector('#tracking-resolve')?.addEventListener('click',async()=>{if(!token||!current||current.estado==='cerrada')return;const btn=document.querySelector('#tracking-resolve');btn.disabled=true;btn.textContent='Cerrando…';const {error}=await supabase.rpc('af_cerrar_necesidad',{p_token:token,p_resuelta:true});if(error){btn.disabled=false;btn.textContent='✓ Ya lo resolví';setAlert('No pudimos cerrar la solicitud.');return;}await load();});
load();timer=setInterval(load,15000);window.addEventListener('beforeunload',()=>clearInterval(timer));
