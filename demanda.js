import { requireAdmin, logout } from './auth.js?v=20260718-120';
import { supabase } from './supabase-client.js?v=20260718-120';
import { shell, esc } from './ui.js?v=20260720-600';
document.body.classList.add('af-page', 'af-page-admin');
const auth=await requireAdmin();
if(auth){shell(auth.profile,auth.user);document.querySelector('#logout-button')?.addEventListener('click',logout);document.querySelector('#demand-refresh')?.addEventListener('click',load);await load();}
const age=v=>{const min=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/60000));if(min<60)return`${min} min`;const h=Math.floor(min/60);if(h<24)return`${h} h`;return`${Math.floor(h/24)} d`;};
async function load(){
 const btn=document.querySelector('#demand-refresh'),warn=document.querySelector('#demand-alert');btn.disabled=true;warn.classList.add('hidden');
 try{
  const [{data:summary,error:sumError},{data:gaps,error:gapError},{data:businesses,error:bizError}]=await Promise.all([
   supabase.rpc('af_admin_demanda_resumen'),
   supabase.from('necesidades').select('id,titulo,categoria_id,categoria_texto,municipio,estado_region,urgencia,created_at,matches_count,respuestas_count').eq('estado','abierta').eq('sin_cobertura',true).order('created_at',{ascending:false}).limit(100),
   supabase.from('negocios').select('id,categoria_id').eq('activo',true).eq('estado','activo').eq('estado_operativo','activo')
  ]);if(sumError)throw sumError;if(gapError)throw gapError;if(bizError)throw bizError;
  const rows=summary||[],gapRows=gaps||[],coverage=new Map();(businesses||[]).forEach(b=>coverage.set(b.categoria_id,(coverage.get(b.categoria_id)||0)+1));
  const total=rows.reduce((s,r)=>s+Number(r.solicitudes||0),0),uncovered=rows.reduce((s,r)=>s+Number(r.sin_cobertura||0),0),replies=rows.reduce((s,r)=>s+Number(r.respuestas||0),0);document.querySelector('#demand-total').textContent=total;document.querySelector('#demand-gaps').textContent=uncovered;document.querySelector('#demand-replies').textContent=replies;
  document.querySelector('#demand-category-status').textContent=`${rows.length} categorías con demanda en 30 días`;
  document.querySelector('#demand-categories').innerHTML=rows.length?rows.map(r=>`<article class="demand-row"><div><strong>${esc(r.categoria)}</strong><p>${Number(r.solicitudes||0)} solicitud${Number(r.solicitudes||0)===1?'':'es'} · ${Number(r.sin_cobertura||0)} sin cobertura · ${Number(r.respuestas||0)} respuestas</p><small style="color:#9ca7b8">Negocios activos en categoría: ${coverage.get(r.categoria_id)||0}</small></div><div><strong style="font-size:1.35rem;color:${Number(r.sin_cobertura||0)>0?'#ff9fb3':'#bfffe1'}">${Number(r.sin_cobertura||0)>0?'FALTA OFERTA':'CUBIERTA'}</strong></div></article>`).join(''):'<div class="home-activity-empty"><span>◌</span><div><strong>Aún no hay demanda registrada.</strong><p>Este tablero se llenará con solicitudes reales.</p></div></div>';
  document.querySelector('#demand-gap-status').textContent=gapRows.length?`${gapRows.length} necesitan intervención`:'Sin pendientes';
  document.querySelector('#demand-gaps-list').innerHTML=gapRows.length?gapRows.map(r=>{const recruit=`Tenemos una solicitud real en Aliados Fantasma: “${r.titulo}”, en ${r.municipio}, ${r.estado_region}. Buscamos un negocio que pueda atenderla. Si te interesa recibir oportunidades como esta, regístrate en Aliados Fantasma.`;return`<article class="demand-row" data-gap="${esc(r.id)}"><div><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="need-tag hot">SIN COBERTURA</span><span class="need-tag">${esc(r.categoria_texto)}</span><span class="need-tag">${esc(r.urgencia)}</span></div><strong style="display:block;margin-top:8px">${esc(r.titulo)}</strong><p>${esc(r.municipio)} · ${esc(r.estado_region)} · hace ${esc(age(r.created_at))}</p><small style="color:#9ca7b8">${Number(r.matches_count||0)} negocios intentados · ${Number(r.respuestas_count||0)} respuestas</small></div><div><button class="need-button small secondary" type="button" data-copy-recruit="${encodeURIComponent(recruit)}">Copiar mensaje para captar proveedor</button></div></article>`;}).join(''):'<div class="home-activity-empty"><span>✓</span><div><strong>No hay solicitudes sin cobertura.</strong><p>El motor está encontrando oferta para las solicitudes abiertas.</p></div></div>';
  document.querySelectorAll('[data-copy-recruit]').forEach(btn=>btn.addEventListener('click',async()=>{const text=decodeURIComponent(btn.dataset.copyRecruit);await navigator.clipboard.writeText(text);const old=btn.textContent;btn.textContent='✓ Copiado';setTimeout(()=>btn.textContent=old,1800);}));
 }catch(error){console.error(error);warn.textContent=`No se pudo cargar Demanda y MATCH: ${error.message||'error desconocido'}`;warn.classList.remove('hidden');}finally{btn.disabled=false;}
}
