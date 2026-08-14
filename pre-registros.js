import { supabase } from './supabase-client.js?v=20260718-120';
import { requireAdmin, logout } from './auth.js?v=20260718-120';
import { shell, esc, fmt } from './ui.js?v=20260718-120';

let rows=[];
let drafts=new Set();
const grid=document.querySelector('#pre-grid');
const warning=document.querySelector('#warning');
const search=document.querySelector('#search');
const filter=document.querySelector('#status-filter');
const refreshButton=document.querySelector('#refresh-button');

function showError(message){warning.textContent=message;warning.classList.remove('hidden');}
function initials(name=''){return name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'AF';}
function phoneHref(value=''){const d=String(value).replace(/\D/g,'').replace(/^52(?=\d{10}$)/,'');return d.length===10?`https://wa.me/52${d}`:'';}

async function load(){
  warning.classList.add('hidden');refreshButton.disabled=true;grid.innerHTML='<div class="loading-card"><div class="spinner"></div><p>Cargando registros…</p></div>';
  try{
    const [{data,error},{data:draftRows,error:draftError}]=await Promise.all([
      supabase.rpc('admin_listar_pre_registros'),
      supabase.from('perfiles_borrador').select('usuario_id')
    ]);
    if(error)throw error;if(draftError)console.warn(draftError);
    rows=data||[];drafts=new Set((draftRows||[]).map(x=>x.usuario_id));updateStats();render();
  }catch(error){console.error(error);showError(`No se pudieron cargar los registros: ${error.message||'error desconocido'}.`);grid.innerHTML='<div class="empty-premium"><span>⚠</span><h3>No fue posible cargar la información</h3><p>Actualiza la página o revisa la conexión con Supabase.</p></div>';}finally{refreshButton.disabled=false;}
}

function updateStats(){
  const verified=rows.filter(row=>row.correo_verificado===true).length;
  const pending=rows.length-verified;
  document.querySelector('#pending-count').textContent=String(pending);
  document.querySelector('#verified-count').textContent=String(verified);
  document.querySelector('#profile-count').textContent=String(rows.filter(row=>drafts.has(row.id)).length);
  document.querySelector('#total-count').textContent=String(rows.length);
  const badge=document.querySelector('#nav-pending');badge.textContent=String(pending);badge.classList.toggle('hidden',pending===0);
}

function render(){
  const term=search.value.trim().toLowerCase();const selected=filter.value;
  const visible=rows.filter(row=>{
    const text=[row.nombre_negocio,row.nombre_responsable,row.correo,row.estado_region,row.municipio,row.colonia,row.whatsapp,row.categoria].join(' ').toLowerCase();
    const statusOk=!selected||(selected==='verified'?row.correo_verificado===true:row.correo_verificado!==true);
    return statusOk&&(!term||text.includes(term));
  });
  if(!visible.length){grid.innerHTML=`<div class="empty-premium"><span>◇</span><h3>No hay registros aquí</h3><p>${rows.length?'Prueba otro filtro o término de búsqueda.':'Los registros aparecerán cuando una persona cree su cuenta.'}</p></div>`;return;}
  grid.innerHTML=visible.map(row=>{
    const verified=row.correo_verificado===true;const hasDraft=drafts.has(row.id);const wa=phoneHref(row.whatsapp);
    return `<article class="application-card" data-status="${verified?'verified':'pending'}"><div class="application-top"><div class="business-avatar">${esc(initials(row.nombre_negocio))}</div><div class="application-title"><div class="status-pill ${verified?'ok':'pending'}"><i></i>${verified?'Cuenta activa':'Falta verificar'}</div><h3>${esc(row.nombre_negocio||'Negocio sin nombre')}</h3><p>${esc(row.categoria||'Categoría por definir')}</p></div></div>
      <div class="completion"><div><span>Acceso</span><strong>${verified?'Panel habilitado':'Esperando confirmación de correo'}</strong></div><div class="progress"><i style="width:${verified?100:45}%"></i></div></div>
      <dl class="application-data"><div><dt>Responsable</dt><dd>${esc(row.nombre_responsable||'—')}</dd></div><div><dt>Correo</dt><dd><a href="mailto:${esc(row.correo||'')}">${esc(row.correo||'—')}</a>${verified?'<em class="verified">✓ Verificado</em>':'<em>Sin verificar</em>'}</dd></div><div><dt>WhatsApp</dt><dd>${wa?`<a href="${wa}" target="_blank" rel="noopener">${esc(row.whatsapp)}</a>`:esc(row.whatsapp||'—')}</dd></div><div><dt>Ubicación</dt><dd>${esc([row.municipio,row.estado_region].filter(Boolean).join(', ')||'—')}</dd></div><div><dt>Perfil</dt><dd>${hasDraft?'<span class="registration-auto-badge">● Iniciado</span>':'Aún no iniciado'}</dd></div><div><dt>Registro</dt><dd>${esc(fmt(row.created_at))}</dd></div></dl>
      <div class="application-actions registration-contact-actions"><a class="button secondary small" href="mailto:${esc(row.correo||'')}">Enviar correo</a>${wa?`<a class="button secondary small" href="${wa}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:''}${hasDraft?`<a class="button primary small" href="solicitudes.html">Ver flujo de perfiles</a>`:''}</div></article>`;
  }).join('');
}
search.addEventListener('input',render);filter.addEventListener('change',render);refreshButton.addEventListener('click',load);
const auth=await requireAdmin();if(auth){shell(auth.profile,auth.user);document.querySelector('#logout-button')?.addEventListener('click',logout);await load();}
