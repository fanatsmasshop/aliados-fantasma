import { supabase } from './supabase-client.js?v=20260720-410';

const LAUNCH_AT = new Date('2026-08-24T14:30:00-06:00');
const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const stepNames = ['Identidad','Contacto','Ubicación','Horarios','Galería','Promociones','Revisión'];
let currentStep = 0;
let user;
let pre;
let draft = { datos:{}, estado:'borrador', porcentaje:0 };
let dirty = false;
let publishedBusiness = null;

const form = document.querySelector('#onboarding-form');
const msg = document.querySelector('#global-message');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const field = name => form.elements.namedItem(name);

function showMessage(text, type='ok', timeout=5000){
  msg.textContent = text;
  msg.className = `notice ${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'success'}`;
  if(timeout) setTimeout(() => msg.classList.add('hidden'), timeout);
}

function cleanSocial(value, platform){
  let text = String(value || '').trim();
  if(!text) return '';
  try{
    const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./,'').toLowerCase();
    const expected = {facebook:['facebook.com','fb.com'],instagram:['instagram.com'],tiktok:['tiktok.com'],youtube:['youtube.com','youtu.be']}[platform] || [];
    if(expected.some(domain => host === domain || host.endsWith(`.${domain}`))){
      const parts = url.pathname.split('/').filter(Boolean);
      text = parts[0] || '';
      if(platform === 'youtube' && ['channel','c','user'].includes(text.toLowerCase())) text = parts[1] || '';
    }
  }catch{}
  return text.split(/[?#]/)[0].replace(/^@+/,'').replace(/^\/+|\/+$/g,'').trim();
}

function normalizeSocialFields(){
  ['facebook','instagram','tiktok','youtube'].forEach(name => {
    const input = field(name);
    if(input) input.value = cleanSocial(input.value, name);
  });
}

function serialize(){
  const data = {...draft.datos};
  normalizeSocialFields();
  ['nombre','categoria','descripcion_corta','descripcion','logo_url','portada_url','whatsapp','telefono','facebook','instagram','tiktok','youtube','web','direccion','colonia','municipio','maps','como_llegar'].forEach(key => data[key] = field(key)?.value.trim() || '');
  data.horarios = days.map((day,index) => ({
    dia:day,
    cerrado:document.querySelector(`[name="closed-${index}"]`).checked,
    abre:document.querySelector(`[name="open-${index}"]`).value,
    cierra:document.querySelector(`[name="close-${index}"]`).value
  }));
  data.galeria = draft.datos.galeria || [];
  data.promociones = [...document.querySelectorAll('.promotion-editor')].map(item => ({
    titulo:item.querySelector('[data-promo="titulo"]').value.trim(),
    descripcion:item.querySelector('[data-promo="descripcion"]').value.trim(),
    vigencia:item.querySelector('[data-promo="vigencia"]').value
  })).filter(item => item.titulo || item.descripcion);
  return data;
}

function calc(data){
  let score = 0;
  const total = 12;
  ['nombre','categoria','descripcion_corta','whatsapp','direccion','municipio','logo_url','portada_url'].forEach(key => { if(data[key]) score++; });
  if((data.horarios || []).some(item => !item.cerrado && item.abre && item.cierra)) score++;
  if((data.galeria || []).length) score++;
  if(data.facebook || data.instagram || data.tiktok || data.youtube || data.web) score++;
  if(data.maps) score++;
  return Math.round(score / total * 100);
}

function missingFields(data){
  const missing = [];
  if(!data.descripcion) missing.push('descripción completa');
  if(!data.logo_url) missing.push('logo');
  if(!data.portada_url) missing.push('portada');
  if(!data.direccion) missing.push('dirección');
  if(!data.maps) missing.push('mapa');
  if(!(data.galeria || []).length) missing.push('galería');
  if(!(data.horarios || []).some(item => !item.cerrado && item.abre && item.cierra)) missing.push('horarios');
  return missing;
}

function renderNav(){
  document.querySelector('#steps-nav').innerHTML = stepNames.map((name,index) => `<button type="button" class="owner-step-link ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'done' : ''}" data-go="${index}">${index < currentStep ? '✓' : String(index + 1).padStart(2,'0')} ${name}</button>`).join('');
  document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => go(+button.dataset.go));
}

function go(index){
  currentStep = Math.max(0, Math.min(stepNames.length - 1, index));
  document.querySelectorAll('.onboarding-step').forEach((section,sectionIndex) => section.classList.toggle('active', sectionIndex === currentStep));
  document.querySelector('#prev-step').disabled = currentStep === 0;
  document.querySelector('#next-step').style.display = currentStep === 6 ? 'none' : '';
  renderNav();
  if(currentStep === 6) renderReview();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderSchedule(data=[]){
  document.querySelector('#schedule-fields').innerHTML = days.map((day,index) => {
    const item = data[index] || {dia:day,cerrado:index === 6,abre:'09:00',cierra:'18:00'};
    return `<div class="schedule-row"><strong>${day}</strong><label><input type="checkbox" name="closed-${index}" ${item.cerrado ? 'checked' : ''}> Cerrado</label><input type="time" name="open-${index}" value="${esc(item.abre || '09:00')}"><input type="time" name="close-${index}" value="${esc(item.cierra || '18:00')}"></div>`;
  }).join('');
}

function renderGallery(){
  const items = draft.datos.galeria || [];
  document.querySelector('#gallery-preview').innerHTML = items.map((url,index) => `<div class="gallery-item"><img src="${esc(url)}" alt="Foto ${index + 1}"><button type="button" class="icon-button" data-remove-image="${index}" aria-label="Eliminar foto">×</button></div>`).join('');
  document.querySelectorAll('[data-remove-image]').forEach(button => button.onclick = () => {
    draft.datos.galeria.splice(+button.dataset.removeImage,1);
    renderGallery();
    markDirty();
  });
}

function addPromotion(item={}){
  const wrap = document.createElement('div');
  wrap.className = 'promotion-editor';
  wrap.innerHTML = `<div class="form-grid"><label class="field"><span>Título</span><input data-promo="titulo" value="${esc(item.titulo || '')}"></label><label class="field"><span>Vigencia</span><input type="date" data-promo="vigencia" value="${esc(item.vigencia || '')}"></label><label class="field wide"><span>Descripción</span><textarea rows="3" data-promo="descripcion">${esc(item.descripcion || '')}</textarea></label></div><button type="button" class="button secondary" data-remove-promo>Eliminar</button>`;
  wrap.querySelector('[data-remove-promo]').onclick = () => { wrap.remove(); markDirty(); };
  document.querySelector('#promotions-list').appendChild(wrap);
}

function fill(data){
  ['nombre','categoria','descripcion_corta','descripcion','logo_url','portada_url','whatsapp','telefono','facebook','instagram','tiktok','youtube','web','direccion','colonia','municipio','maps','como_llegar'].forEach(key => { if(field(key)) field(key).value = data[key] || ''; });
  renderSchedule(data.horarios);
  renderGallery();
  document.querySelector('#promotions-list').innerHTML = '';
  (data.promociones || []).forEach(addPromotion);
}

function statusLabel(status){
  return ({
    borrador:'Borrador',
    en_revision:'En revisión',
    cambios_solicitados:'Cambios solicitados',
    aprobado:'Aprobado · en espera',
    publicado:'Publicado',
    rechazado:'No aprobado'
  })[status] || status || 'Borrador';
}

function renderReview(){
  const data = serialize();
  const percentage = calc(data);
  document.querySelector('#review-summary').innerHTML = `<article class="review-card"><span>Perfil completado</span><strong>${percentage}%</strong></article><article class="review-card"><span>Galería</span><strong>${data.galeria.length}/6 fotos</strong></article><article class="review-card"><span>Promociones</span><strong>${data.promociones.length}</strong></article><article class="review-card"><span>Estado</span><strong>${esc(statusLabel(draft.estado))}</strong></article>`;
  updateSubmitState();
  renderProfileAccess();
}

function updateProgress(){
  const percentage = calc(serialize());
  document.querySelector('#progress-label').textContent = `${percentage}%`;
  document.querySelector('#progress-bar').style.width = `${percentage}%`;
  return percentage;
}

function statusMeta(status){
  const launchPassed = Date.now() >= LAUNCH_AT.getTime();
  const common = {
    borrador:{title:'Tu perfil está en preparación',description:'Completa la información, guarda tus avances y envíalo cuando esté listo.',badge:'Borrador',className:'draft',stage:1},
    en_revision:{title:'Recibimos tu perfil',description:'El equipo de Aliados Fantasma está revisando la información enviada. Te mostraremos aquí cualquier respuesta.',badge:'En revisión',className:'review',stage:2},
    cambios_solicitados:{title:'Necesitamos algunos cambios',description:'Revisa el comentario del administrador, corrige el perfil y vuelve a enviarlo a revisión.',badge:'Correcciones',className:'changes',stage:1},
    aprobado:{title:launchPassed ? 'Tu perfil está aprobado' : 'Tu perfil está aprobado y listo',description:launchPassed ? 'La aprobación terminó. Tu perfil podrá mostrarse de acuerdo con su estado público.' : 'Ya fue preparado, pero seguirá privado hasta el lanzamiento oficial de Aliados Fantasma.',badge:'Aprobado',className:'approved',stage:3},
    publicado:{title:'Tu negocio ya está publicado',description:'El perfil está disponible en la red. Las modificaciones futuras deberán pasar por una nueva revisión.',badge:'Publicado',className:'published',stage:4},
    rechazado:{title:'El perfil requiere una nueva propuesta',description:'Consulta el motivo, actualiza la información y vuelve a enviarla cuando esté corregida.',badge:'No aprobado',className:'changes',stage:1}
  };
  return common[status] || common.borrador;
}

function formatDate(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date);
}

function canonicalProfileUrl(){
  if(!publishedBusiness?.slug) return '';
  return new URL(`perfil.html?slug=${encodeURIComponent(publishedBusiness.slug)}`, location.href).href;
}

function renderProfileAccess(){
  const card = document.querySelector('#profile-access-card');
  if(!card) return;
  const eligible = Boolean(publishedBusiness?.slug && draft.negocio_id && ['aprobado','publicado'].includes(draft.estado));
  if(!eligible){
    card.classList.add('hidden');
    return;
  }
  const url = canonicalProfileUrl();
  const isPublic = draft.estado === 'publicado' && Date.now() >= LAUNCH_AT.getTime();
  card.classList.remove('hidden');
  const status = document.querySelector('#profile-access-status');
  status.textContent = isPublic ? 'Público' : 'En espera';
  status.className = `workflow-badge ${isPublic ? 'published' : 'approved'}`;
  document.querySelector('#profile-access-help').textContent = isPublic
    ? 'Este es el enlace público que puedes compartir con tus clientes.'
    : 'Tu enlace ya está reservado. El perfil seguirá privado para el público hasta el lanzamiento.';
  document.querySelector('#owner-profile-link').value = url;
  document.querySelector('#owner-qr').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}" alt="Código QR de ${esc(draft.datos?.nombre || 'tu negocio')}">`;
  document.querySelector('#profile-access-note').textContent = isPublic
    ? 'El QR abre directamente tu perfil público.'
    : 'Puedes descargar o guardar este QR desde el navegador, pero el enlace mostrará el perfil al público únicamente después del lanzamiento.';
}

async function loadPublishedBusiness(){
  publishedBusiness = null;
  if(!draft.negocio_id) return;
  const {data,error} = await supabase.from('negocios').select('id,slug,nombre,activo').eq('id',draft.negocio_id).maybeSingle();
  if(error){ console.error('No fue posible consultar el enlace público:', error); return; }
  publishedBusiness = data || null;
}

function renderWorkflow(){
  const meta = statusMeta(draft.estado);
  const badge = document.querySelector('#workflow-badge');
  document.querySelector('#workflow-title').textContent = meta.title;
  document.querySelector('#workflow-description').textContent = meta.description;
  badge.textContent = meta.badge;
  badge.className = `workflow-badge ${meta.className}`;

  const stages = [
    {title:'Configurar',detail:'Completar información'},
    {title:'Enviar',detail:'Solicitar revisión'},
    {title:'Aprobación',detail:'Validación administrativa'},
    {title:'Publicación',detail:'Visible para clientes'}
  ];
  document.querySelector('#workflow-timeline').innerHTML = stages.map((stage,index) => {
    const stageNumber = index + 1;
    const done = stageNumber < meta.stage || (draft.estado === 'publicado' && stageNumber <= 4);
    const current = stageNumber === meta.stage && draft.estado !== 'publicado';
    return `<article class="workflow-stage ${done ? 'done' : ''} ${current ? 'current' : ''}"><span>${done ? '✓' : stageNumber}</span><strong>${stage.title}</strong><small>${stage.detail}</small></article>`;
  }).join('');

  const actions = [];
  actions.push('<button type="button" class="button secondary small" data-workflow-preview>Ver vista previa</button>');
  if(['cambios_solicitados','rechazado'].includes(draft.estado)) actions.push('<button type="button" class="button primary small" data-workflow-edit>Ir a corregir</button>');
  if(draft.negocio_id && ['aprobado','publicado'].includes(draft.estado)) actions.push('<button type="button" class="button secondary small" data-open-owner-profile>Ver perfil preparado</button>');
  document.querySelector('#workflow-actions').innerHTML = actions.join('');
  document.querySelector('[data-workflow-preview]')?.addEventListener('click', previewProfile);
  document.querySelector('[data-workflow-edit]')?.addEventListener('click', () => go(0));
  document.querySelector('[data-open-owner-profile]')?.addEventListener('click', openOwnerProfile);

  const launchWait = document.querySelector('#launch-wait');
  if(draft.estado === 'aprobado' && Date.now() < LAUNCH_AT.getTime()){
    launchWait.classList.remove('hidden');
    document.querySelector('#launch-wait-text').textContent = `Aunque ya está listo, seguirá oculto al público hasta el 24 de agosto de 2026 a las 2:30 p. m. Solo tú y los administradores pueden revisarlo antes de esa fecha.`;
  }else{
    launchWait.classList.add('hidden');
  }

  const feedback = document.querySelector('#admin-feedback');
  if(draft.comentario_administrador){
    feedback.classList.remove('hidden');
    feedback.className = `notice ${['aprobado','publicado'].includes(draft.estado) ? 'success' : draft.estado === 'en_revision' ? 'warning' : 'danger'}`;
    feedback.innerHTML = `<strong>Mensaje del equipo de Aliados Fantasma</strong><p>${esc(draft.comentario_administrador)}</p>${draft.revisado_at ? `<small>Actualizado: ${esc(formatDate(draft.revisado_at))}</small>` : ''}`;
  }else{
    feedback.classList.add('hidden');
  }

  document.querySelector('#account-status').textContent = meta.badge.toUpperCase();
  document.querySelector('#header-help').textContent = draft.estado === 'en_revision' ? 'Tu envío quedó registrado. Aquí aparecerá la respuesta del equipo.' : draft.estado === 'aprobado' ? 'Tu perfil ya fue aprobado y está reservado para el lanzamiento.' : draft.estado === 'publicado' ? 'Administra la información de tu negocio y prepara futuras actualizaciones.' : 'Completa tu información. Puedes guardar y continuar después.';
  updateSubmitState();
  renderProfileAccess();
}

function updateSubmitState(){
  const button = document.querySelector('#submit-review');
  const help = document.querySelector('#submit-help');
  if(!button || !help) return;
  const percentage = updateProgress();
  const meta = {
    borrador:{text:'Enviar mi perfil a revisión',disabled:false,help: percentage < 60 ? 'Necesitas completar al menos 60% para enviarlo.' : 'Al enviarlo, el equipo recibirá esta versión para revisarla.'},
    cambios_solicitados:{text:'Volver a enviar a revisión',disabled:false,help:'Guarda las correcciones y envía una nueva versión al equipo.'},
    rechazado:{text:'Enviar perfil corregido',disabled:false,help:'Puedes presentar nuevamente el perfil después de corregir el motivo indicado.'},
    en_revision:{text:'Perfil enviado',disabled:true,help:'La revisión ya está en curso. Si haces cambios, guárdalos y vuelve a enviarlos como una nueva versión.'},
    aprobado:{text:'Perfil aprobado',disabled:true,help:'Está aprobado y en espera del lanzamiento. Los cambios posteriores necesitan una nueva revisión.'},
    publicado:{text:'Perfil publicado',disabled:true,help:'Los cambios posteriores deben guardarse y enviarse nuevamente para revisión.'}
  }[draft.estado] || {text:'Enviar mi perfil a revisión',disabled:false,help:''};
  button.textContent = meta.text;
  button.disabled = meta.disabled || percentage < 60;
  help.textContent = meta.help;
}

function markDirty(){
  dirty = true;
  document.querySelector('#save-state').textContent = 'Cambios sin guardar';
  document.querySelector('#save-state').className = 'status-pill pending';
  if(['en_revision','aprobado','publicado'].includes(draft.estado)){
    showMessage('Estos cambios crearán una nueva versión y deberán enviarse nuevamente a revisión.', 'warning', 3500);
  }
  updateProgress();
  updateSubmitState();
}

function nextSaveStatus(requestedStatus){
  if(requestedStatus === 'en_revision') return 'en_revision';
  if(dirty && ['en_revision','aprobado','publicado'].includes(draft.estado)) return 'borrador';
  if(draft.estado === 'rechazado' && dirty) return 'borrador';
  return requestedStatus || draft.estado || 'borrador';
}

async function save(requestedStatus){
  const data = serialize();
  const percentage = calc(data);
  const status = nextSaveStatus(requestedStatus);
  document.querySelector('#save-state').textContent = 'Guardando…';
  const payload = {
    usuario_id:user.id,
    datos:data,
    estado:status,
    porcentaje:percentage,
    updated_at:new Date().toISOString(),
    enviado_at:status === 'en_revision' ? new Date().toISOString() : draft.enviado_at || null
  };
  if(status === 'borrador' && draft.estado !== 'borrador') payload.comentario_administrador = draft.comentario_administrador || null;
  const {data:row,error} = await supabase.from('perfiles_borrador').upsert(payload).select().single();
  if(error) throw error;
  draft = row;
  dirty = false;
  document.querySelector('#save-state').textContent = 'Guardado';
  document.querySelector('#save-state').className = 'status-pill ok';
  updateProgress();
  renderWorkflow();
  if(currentStep === 6) renderReview();
  return row;
}

async function uploadFile(file,kind){
  if(!file) return null;
  if(file.size > 10 * 1024 * 1024) throw new Error('La imagen supera 10 MB');
  const ext = (file.name.split('.').pop() || 'webp').toLowerCase();
  const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
  const {error} = await supabase.storage.from('negocios-media').upload(path,file,{upsert:true});
  if(error) throw error;
  return supabase.storage.from('negocios-media').getPublicUrl(path).data.publicUrl;
}

function openOwnerProfile(){
  if(draft.estado === 'publicado' && Date.now() >= LAUNCH_AT.getTime() && publishedBusiness?.slug){
    location.href = `perfil.html?slug=${encodeURIComponent(publishedBusiness.slug)}&from=panel`;
    return;
  }
  location.href = 'perfil.html?preview=1&from=panel';
}

async function copyOwnerProfileLink(){
  const url = canonicalProfileUrl();
  if(!url) return;
  try{
    await navigator.clipboard.writeText(url);
    showMessage('Enlace copiado correctamente.');
  }catch{
    const input = document.querySelector('#owner-profile-link');
    input.focus(); input.select();
    document.execCommand('copy');
    showMessage('Enlace copiado correctamente.');
  }
}

async function previewProfile(){
  try{
    if(dirty) await save();
    location.href = 'perfil.html?preview=1';
  }catch(error){ showMessage(error.message,'error'); }
}

async function init(){
  const {data:{user:authenticatedUser}} = await supabase.auth.getUser();
  if(!authenticatedUser){ location.replace('login.html'); return; }
  user = authenticatedUser;

  const {data:preData,error:preError} = await supabase.rpc('usuario_obtener_mi_pre_registro');
  if(preError) throw preError;
  pre = Array.isArray(preData) ? preData[0] : preData;
  if(!pre){ location.replace('estado-cuenta.html'); return; }

  document.querySelector('#welcome-title').textContent = `Bienvenido, ${pre.nombre_negocio || 'tu negocio'} 👋`;
  const {data:draftData,error} = await supabase.from('perfiles_borrador').select('*').eq('usuario_id',authenticatedUser.id).maybeSingle();
  if(error) throw error;
  if(draftData) draft = draftData;
  else draft.datos = {nombre:pre.nombre_negocio || '',categoria:pre.categoria || '',whatsapp:pre.whatsapp || '',municipio:pre.municipio || '',colonia:pre.colonia || '',galeria:[],promociones:[]};

  await loadPublishedBusiness();
  fill(draft.datos);
  updateProgress();
  renderNav();
  renderWorkflow();
}

document.querySelector('#prev-step').onclick = () => go(currentStep - 1);
document.querySelector('#next-step').onclick = () => go(currentStep + 1);
document.querySelector('#save-button').onclick = async () => {
  try{
    const previous = draft.estado;
    await save();
    showMessage(['en_revision','aprobado','publicado'].includes(previous) ? 'Cambios guardados como nueva versión. Envíalos nuevamente cuando estén listos.' : 'Progreso guardado correctamente.');
  }catch(error){ console.error(error); showMessage(`No se pudo guardar: ${error.message}`,'error'); }
};
document.querySelector('#add-promotion').onclick = () => { addPromotion(); markDirty(); };
document.querySelector('#preview-button').onclick = previewProfile;
document.querySelector('#copy-profile-link').onclick = copyOwnerProfileLink;
document.querySelector('#open-owner-profile').onclick = openOwnerProfile;
document.querySelector('#logout-button').onclick = async () => { await supabase.auth.signOut(); location.replace('login.html'); };
document.querySelector('#submit-review').onclick = async () => {
  try{
    const percentage = updateProgress();
    if(percentage < 60){ showMessage('Completa al menos 60% del perfil antes de enviarlo.','error'); return; }
    const missing = missingFields(serialize());
    const detail = missing.length ? ` Aún faltan elementos recomendados: ${missing.join(', ')}.` : '';
    if(!confirm(`¿Enviar esta versión a revisión?${detail}`)) return;
    await save('en_revision');
    showMessage('Confirmación: recibimos tu perfil y quedó enviado a revisión.', 'ok', 7000);
    go(6);
  }catch(error){ showMessage(error.message,'error'); }
};
form.addEventListener('input',markDirty);
['facebook','instagram','tiktok','youtube'].forEach(name => field(name)?.addEventListener('blur',() => { field(name).value = cleanSocial(field(name).value,name); }));
document.querySelector('#logo-file').onchange = async event => { try{ field('logo_url').value = await uploadFile(event.target.files[0],'logo'); markDirty(); showMessage('Logo cargado. Guarda los cambios para conservarlo.'); }catch(error){ showMessage(error.message,'error'); } };
document.querySelector('#portada-file').onchange = async event => { try{ field('portada_url').value = await uploadFile(event.target.files[0],'portada'); markDirty(); showMessage('Portada cargada. Guarda los cambios para conservarla.'); }catch(error){ showMessage(error.message,'error'); } };
document.querySelector('#gallery-files').onchange = async event => {
  try{
    for(const file of [...event.target.files].slice(0,6 - (draft.datos.galeria || []).length)){
      const url = await uploadFile(file,'galeria');
      draft.datos.galeria = [...(draft.datos.galeria || []),url];
    }
    renderGallery();
    markDirty();
    showMessage('Galería actualizada. Guarda los cambios para conservarla.');
  }catch(error){ showMessage(error.message,'error'); }
};
window.addEventListener('beforeunload', event => { if(dirty){ event.preventDefault(); event.returnValue = ''; } });

try{ await init(); }catch(error){ console.error(error); showMessage(`No se pudo cargar el centro de configuración. ${error.message}`,'error',0); }
