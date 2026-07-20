import { supabase } from './supabase-client.js?v=20260720-310';

const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const stepNames=['Identidad','Contacto','Ubicación','Horarios','Galería','Promociones','Revisión'];
let currentStep=0,user,pre,draft={datos:{},estado:'borrador',porcentaje:0};
const form=document.querySelector('#onboarding-form');
const msg=document.querySelector('#global-message');

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function showMessage(text,type='ok'){msg.textContent=text;msg.className=`notice ${type==='error'?'danger':'success'}`;setTimeout(()=>msg.classList.add('hidden'),4000)}
function field(name){return form.elements.namedItem(name)}
function cleanSocial(value, platform){
  let text=String(value||'').trim();
  if(!text)return '';
  try{
    const candidate=/^https?:\/\//i.test(text)?text:`https://${text}`;
    const url=new URL(candidate);
    const host=url.hostname.replace(/^www\./,'').toLowerCase();
    const expected={facebook:['facebook.com','fb.com'],instagram:['instagram.com'],tiktok:['tiktok.com'],youtube:['youtube.com','youtu.be']}[platform]||[];
    if(expected.some(domain=>host===domain||host.endsWith(`.${domain}`))){
      const parts=url.pathname.split('/').filter(Boolean);
      text=parts[0]||'';
      if(platform==='youtube'&&['channel','c','user'].includes(text.toLowerCase()))text=parts[1]||'';
    }
  }catch{}
  text=text.split(/[?#]/)[0].replace(/^@+/,'').replace(/^\/+|\/+$/g,'').trim();
  return text;
}
function normalizeSocialFields(){
  ['facebook','instagram','tiktok','youtube'].forEach(name=>{
    const input=field(name);
    if(input)input.value=cleanSocial(input.value,name);
  });
}
function serialize(){
  const data={...draft.datos};
  normalizeSocialFields();
  ['nombre','categoria','descripcion_corta','descripcion','logo_url','portada_url','whatsapp','telefono','facebook','instagram','tiktok','youtube','web','direccion','colonia','municipio','maps','como_llegar'].forEach(k=>data[k]=field(k)?.value.trim()||'');
  data.horarios=days.map((d,i)=>({dia:d,cerrado:document.querySelector(`[name="closed-${i}"]`).checked,abre:document.querySelector(`[name="open-${i}"]`).value,cierra:document.querySelector(`[name="close-${i}"]`).value}));
  data.galeria=draft.datos.galeria||[];
  data.promociones=[...document.querySelectorAll('.promotion-editor')].map(x=>({titulo:x.querySelector('[data-promo="titulo"]').value.trim(),descripcion:x.querySelector('[data-promo="descripcion"]').value.trim(),vigencia:x.querySelector('[data-promo="vigencia"]').value})).filter(x=>x.titulo||x.descripcion);
  return data;
}
function calc(data){let score=0,total=12;['nombre','categoria','descripcion_corta','whatsapp','direccion','municipio','logo_url','portada_url'].forEach(k=>{if(data[k])score++});if((data.horarios||[]).some(x=>!x.cerrado&&x.abre&&x.cierra))score++;if((data.galeria||[]).length)score++;if(data.facebook||data.instagram||data.tiktok||data.youtube||data.web)score++;if(data.maps)score++;return Math.round(score/total*100)}
function renderNav(){document.querySelector('#steps-nav').innerHTML=stepNames.map((n,i)=>`<button type="button" class="owner-step-link ${i===currentStep?'active':''} ${i<currentStep?'done':''}" data-go="${i}">${i<currentStep?'✓':String(i+1).padStart(2,'0')} ${n}</button>`).join('');document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(+b.dataset.go))}
function go(i){currentStep=Math.max(0,Math.min(stepNames.length-1,i));document.querySelectorAll('.onboarding-step').forEach((s,k)=>s.classList.toggle('active',k===currentStep));document.querySelector('#prev-step').disabled=currentStep===0;document.querySelector('#next-step').style.display=currentStep===6?'none':'';renderNav();if(currentStep===6)renderReview();window.scrollTo({top:0,behavior:'smooth'})}
function renderSchedule(data=[]){document.querySelector('#schedule-fields').innerHTML=days.map((d,i)=>{const x=data[i]||{dia:d,cerrado:i===6,abre:'09:00',cierra:'18:00'};return `<div class="schedule-row"><strong>${d}</strong><label><input type="checkbox" name="closed-${i}" ${x.cerrado?'checked':''}> Cerrado</label><input type="time" name="open-${i}" value="${esc(x.abre||'09:00')}"><input type="time" name="close-${i}" value="${esc(x.cierra||'18:00')}"></div>`}).join('')}
function renderGallery(){const items=draft.datos.galeria||[];document.querySelector('#gallery-preview').innerHTML=items.map((url,i)=>`<div class="gallery-item"><img src="${esc(url)}" alt="Foto ${i+1}"><button type="button" class="icon-button" data-remove-image="${i}">×</button></div>`).join('');document.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=()=>{draft.datos.galeria.splice(+b.dataset.removeImage,1);renderGallery();markDirty()})}
function addPromotion(x={}){const wrap=document.createElement('div');wrap.className='promotion-editor';wrap.innerHTML=`<div class="form-grid"><label class="field"><span>Título</span><input data-promo="titulo" value="${esc(x.titulo||'')}"></label><label class="field"><span>Vigencia</span><input type="date" data-promo="vigencia" value="${esc(x.vigencia||'')}"></label><label class="field wide"><span>Descripción</span><textarea rows="3" data-promo="descripcion">${esc(x.descripcion||'')}</textarea></label></div><button type="button" class="button secondary" data-remove-promo>Eliminar</button>`;wrap.querySelector('[data-remove-promo]').onclick=()=>wrap.remove();document.querySelector('#promotions-list').appendChild(wrap)}
function fill(data){['nombre','categoria','descripcion_corta','descripcion','logo_url','portada_url','whatsapp','telefono','facebook','instagram','tiktok','youtube','web','direccion','colonia','municipio','maps','como_llegar'].forEach(k=>{if(field(k))field(k).value=data[k]||''});renderSchedule(data.horarios);renderGallery();document.querySelector('#promotions-list').innerHTML='';(data.promociones||[]).forEach(addPromotion)}
function renderReview(){const data=serialize(),p=calc(data);document.querySelector('#review-summary').innerHTML=`<article class="review-card"><span>Perfil completado</span><strong>${p}%</strong></article><article class="review-card"><span>Galería</span><strong>${data.galeria.length}/6 fotos</strong></article><article class="review-card"><span>Promociones</span><strong>${data.promociones.length}</strong></article><article class="review-card"><span>Estado</span><strong>${({en_revision:'En revisión',cambios_solicitados:'Cambios solicitados',publicado:'Publicado',rechazado:'No aprobado',borrador:'Borrador'})[draft.estado]||draft.estado}</strong></article>`}
function updateProgress(){const p=calc(serialize());document.querySelector('#progress-label').textContent=`${p}%`;document.querySelector('#progress-bar').style.width=`${p}%`;return p}
function markDirty(){document.querySelector('#save-state').textContent='Cambios sin guardar';document.querySelector('#save-state').className='status-pill pending';updateProgress()}
async function save(status=draft.estado){const data=serialize(),percentage=calc(data);document.querySelector('#save-state').textContent='Guardando…';const payload={usuario_id:user.id,datos:data,estado:status,porcentaje:percentage,updated_at:new Date().toISOString(),enviado_at:status==='en_revision'?new Date().toISOString():draft.enviado_at||null};const {data:row,error}=await supabase.from('perfiles_borrador').upsert(payload).select().single();if(error)throw error;draft=row;document.querySelector('#save-state').textContent='Guardado';document.querySelector('#save-state').className='status-pill ok';updateProgress();return row}
async function uploadFile(file,kind){if(!file)return null;if(file.size>10*1024*1024)throw new Error('La imagen supera 10 MB');const ext=(file.name.split('.').pop()||'webp').toLowerCase();const path=`${user.id}/${kind}-${Date.now()}.${ext}`;const {error}=await supabase.storage.from('negocios-media').upload(path,file,{upsert:true});if(error)throw error;return supabase.storage.from('negocios-media').getPublicUrl(path).data.publicUrl}
async function init(){const {data:{user:u}}=await supabase.auth.getUser();if(!u){location.replace('login.html');return}user=u;const {data:p,error:pe}=await supabase.rpc('usuario_obtener_mi_pre_registro');if(pe)throw pe;pre=Array.isArray(p)?p[0]:p;if(!pre){location.replace('estado-cuenta.html');return}document.querySelector('#welcome-title').textContent=`Bienvenido, ${pre.nombre_negocio||'tu negocio'} 👋`;document.querySelector('#account-status').textContent=pre.estado==='aprobado'?'PRE-REGISTRO APROBADO · CONFIGURA TU PERFIL':pre.estado==='contactado'?'EN SEGUIMIENTO · PUEDES AVANZAR TU PERFIL':'SOLICITUD RECIBIDA · PUEDES AVANZAR TU PERFIL';const {data:d,error}=await supabase.from('perfiles_borrador').select('*').eq('usuario_id',u.id).maybeSingle();if(error)throw error;if(d)draft=d;else draft.datos={nombre:pre.nombre_negocio||'',categoria:pre.categoria||'',whatsapp:pre.whatsapp||'',municipio:pre.municipio||'',colonia:pre.colonia||'',galeria:[],promociones:[]};
  const feedback=document.querySelector('#admin-feedback');
  const statusCopy={en_revision:'Tu perfil está en revisión. Puedes consultar la vista previa mientras el equipo lo evalúa.',cambios_solicitados:'El equipo solicitó correcciones antes de publicar tu perfil.',publicado:'Tu perfil ya está publicado. Los cambios nuevos deberán enviarse nuevamente a revisión.',rechazado:'Tu perfil no fue aprobado. Revisa el motivo y actualiza la información antes de volver a enviarlo.'};
  if(statusCopy[draft.estado]){feedback.classList.remove('hidden');feedback.className=`notice ${draft.estado==='publicado'?'success':draft.estado==='en_revision'?'warning':'danger'}`;feedback.innerHTML=`<strong>${statusCopy[draft.estado]}</strong>${draft.comentario_administrador?`<p>${esc(draft.comentario_administrador)}</p>`:''}${draft.estado==='publicado'&&draft.negocio_id?`<p><a class="button secondary small" href="perfil.html?business_id=${encodeURIComponent(draft.negocio_id)}" target="_blank">Ver perfil publicado</a></p>`:''}`;}
  fill(draft.datos);updateProgress();renderNav()}

document.querySelector('#prev-step').onclick=()=>go(currentStep-1);document.querySelector('#next-step').onclick=()=>go(currentStep+1);document.querySelector('#save-button').onclick=async()=>{try{await save();showMessage('Progreso guardado correctamente.')}catch(e){console.error(e);showMessage(`No se pudo guardar: ${e.message}`,'error')}};document.querySelector('#add-promotion').onclick=()=>addPromotion();document.querySelector('#preview-button').onclick=async()=>{try{await save();location.href='perfil.html?preview=1'}catch(e){showMessage(e.message,'error')}};document.querySelector('#logout-button').onclick=async()=>{await supabase.auth.signOut();location.replace('login.html')};document.querySelector('#submit-review').onclick=async()=>{try{const p=updateProgress();if(p<60){showMessage('Completa al menos 60% del perfil antes de enviarlo.','error');return}await save('en_revision');showMessage('Tu perfil fue enviado a revisión.');renderReview()}catch(e){showMessage(e.message,'error')}};
form.addEventListener('input',markDirty);
['facebook','instagram','tiktok','youtube'].forEach(name=>field(name)?.addEventListener('blur',()=>{field(name).value=cleanSocial(field(name).value,name)}));
document.querySelector('#logo-file').onchange=async e=>{try{field('logo_url').value=await uploadFile(e.target.files[0],'logo');markDirty();showMessage('Logo cargado.')}catch(err){showMessage(err.message,'error')}};
document.querySelector('#portada-file').onchange=async e=>{try{field('portada_url').value=await uploadFile(e.target.files[0],'portada');markDirty();showMessage('Portada cargada.')}catch(err){showMessage(err.message,'error')}};
document.querySelector('#gallery-files').onchange=async e=>{try{for(const file of [...e.target.files].slice(0,6-(draft.datos.galeria||[]).length)){const url=await uploadFile(file,'galeria');draft.datos.galeria=[...(draft.datos.galeria||[]),url]}renderGallery();markDirty()}catch(err){showMessage(err.message,'error')}};

try{await init()}catch(e){console.error(e);showMessage(`No se pudo cargar el centro de configuración. Ejecuta 060_onboarding_perfil.sql en Supabase. ${e.message}`,'error')}
