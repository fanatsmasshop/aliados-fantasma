import { supabase } from './supabase-client.js?v=20260720-600';
import { getLaunchState, LAUNCH_LABEL } from './launch-control.js?v=20260723-900';
import { requireContext, clearActiveContext } from './auth-context.js?v=20260724-CTX-LOCK-002';

let launchOpen = false;
const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const stepNames = ['Identidad','Contacto','Ubicación','Horarios','Galería','Promociones','Revisión'];
let currentStep = 0;
let user;
let pre;
let draft = { datos:{}, estado:'borrador', porcentaje:0 };
let dirty = false;
let publishedBusiness = null;
let adminBusinessId = new URLSearchParams(location.search).get('admin_business');
let adminMode = Boolean(adminBusinessId);
let draftOwnerId = null;
let adminReadOnly = false;

let ownerMemberships = [];
let activeOwnerMembership = null;
let isGlobalAdmin = false;

function preferredBusinessId(){
  const params = new URLSearchParams(location.search);
  return params.get('business') || localStorage.getItem('af_owner_business_id') || '';
}

function rememberBusiness(id){
  if(id) localStorage.setItem('af_owner_business_id', id);
}

async function loadOwnerMemberships(userId){
  const {data,error} = await supabase
    .from('miembros_negocio')
    .select('negocio_id,rol,activo,negocios(id,nombre,slug,activo,estado,whatsapp,telefono,descripcion_corta,descripcion,direccion,colonia,municipio,enlace_maps,logo_url,portada_url)')
    .eq('perfil_id',userId)
    .eq('activo',true);
  if(error) throw error;
  ownerMemberships = (data || []).filter(item => item.negocios);
  return ownerMemberships;
}

function chooseOwnerMembership(rows){
  if(!rows.length) return null;
  const preferred = preferredBusinessId();
  return rows.find(item => item.negocio_id === preferred) || rows[0];
}

function renderOwnerRoleNavigation(){
  // El negocio se elige al iniciar sesión y permanece bloqueado hasta cerrar sesión.
  document.querySelector('#owner-role-navigation')?.remove();
}

function businessToDraftData(business){
  return {
    nombre:business?.nombre || '', categoria:'', descripcion_corta:business?.descripcion_corta || '',
    descripcion:business?.descripcion || '', logo_url:business?.logo_url || '', portada_url:business?.portada_url || '',
    whatsapp:business?.whatsapp || '', telefono:business?.telefono || '', direccion:business?.direccion || '',
    colonia:business?.colonia || '', municipio:business?.municipio || '', maps:business?.enlace_maps || '',
    galeria:[], promociones:[], horarios:[]
  };
}

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
  const launchPassed = launchOpen;
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
  const isPublic = draft.estado === 'publicado' && launchOpen;
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
  if(draft.estado === 'aprobado' && !launchOpen){
    launchWait.classList.remove('hidden');
    document.querySelector('#launch-wait-text').textContent = `Aunque ya está listo, seguirá oculto al público hasta el ${LAUNCH_LABEL} Solo tú y los administradores pueden revisarlo antes de esa fecha.`;
  }else{
    launchWait.classList.add('hidden');
  }

  // Los mensajes administrativos ahora viven en el Centro de Notificaciones.
  // Se oculta el bloque fijo para que un aviso ya leído no ocupe permanentemente el inicio.
  const feedback = document.querySelector('#admin-feedback');
  if(feedback) feedback.classList.add('hidden');

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
  if(adminMode && adminReadOnly) throw new Error('Este negocio todavía no tiene una cuenta propietaria. El modo administrador está disponible únicamente para consulta.');
  const data = serialize();
  const percentage = calc(data);
  const status = nextSaveStatus(requestedStatus);
  document.querySelector('#save-state').textContent = 'Guardando…';
  const payload = {
    usuario_id:draftOwnerId || user.id,
    negocio_id:adminMode ? adminBusinessId : (draft.negocio_id || null),
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
  const path = `${draftOwnerId || user.id}/${kind}-${Date.now()}.${ext}`;
  const {error} = await supabase.storage.from('negocios-media').upload(path,file,{upsert:true});
  if(error) throw error;
  return supabase.storage.from('negocios-media').getPublicUrl(path).data.publicUrl;
}

function openOwnerProfile(){
  if(draft.estado === 'publicado' && launchOpen && publishedBusiness?.slug){
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
    location.href = adminMode && publishedBusiness?.slug ? `perfil.html?slug=${encodeURIComponent(publishedBusiness.slug)}&from=panel` : 'perfil.html?preview=1';
  }catch(error){ showMessage(error.message,'error'); }
}

async function init(){
  launchOpen = (await getLaunchState()).open;
  const {data:{user:authenticatedUser}} = await supabase.auth.getUser();
  if(!authenticatedUser){ location.replace('login.html'); return; }
  user = authenticatedUser;

  const activeContext = requireContext(authenticatedUser.id, adminMode ? 'admin' : 'owner');
  if(!activeContext) return;
  if(!adminMode && activeContext.businessId){
    const requested = new URLSearchParams(location.search).get('business');
    if(requested && requested !== activeContext.businessId){ location.replace(`panel.html?business=${encodeURIComponent(activeContext.businessId)}`); return; }
    localStorage.setItem('af_owner_business_id', activeContext.businessId);
  }

  if(adminMode){
    const {data:isAdmin,error:adminError} = await supabase.rpc('es_administrador');
    if(adminError || !isAdmin) throw new Error('No tienes permisos para administrar este negocio.');

    const {data:business,error:businessError} = await supabase
      .from('negocios')
      .select('id,nombre,slug,whatsapp,telefono,descripcion_corta,descripcion,direccion,colonia,municipio,enlace_maps,logo_url,portada_url,activo,estado')
      .eq('id',adminBusinessId)
      .maybeSingle();
    if(businessError) throw businessError;
    if(!business) throw new Error('El negocio seleccionado no existe o ya no está disponible.');
    publishedBusiness = business;

    const {data:linkedDraft,error:draftError} = await supabase
      .from('perfiles_borrador')
      .select('*')
      .eq('negocio_id',adminBusinessId)
      .maybeSingle();
    if(draftError) throw draftError;

    if(linkedDraft){
      draft = linkedDraft;
      draftOwnerId = linkedDraft.usuario_id;
    }else{
      const {data:ownerRows,error:ownerError} = await supabase
        .from('miembros_negocio')
        .select('perfil_id,rol,activo')
        .eq('negocio_id',adminBusinessId)
        .eq('activo',true)
        .order('rol',{ascending:true});
      if(ownerError) console.warn('No se pudo consultar al propietario:', ownerError);
      const owner = (ownerRows || []).find(row => row.rol === 'propietario') || (ownerRows || [])[0];
      draftOwnerId = owner?.perfil_id || null;
      adminReadOnly = !draftOwnerId;
      draft = {
        usuario_id:draftOwnerId,
        negocio_id:business.id,
        estado:business.activo ? 'publicado' : 'borrador',
        porcentaje:0,
        datos:{
          nombre:business.nombre || '', categoria:'', descripcion_corta:business.descripcion_corta || '',
          descripcion:business.descripcion || '', logo_url:business.logo_url || '', portada_url:business.portada_url || '',
          whatsapp:business.whatsapp || '', telefono:business.telefono || '', direccion:business.direccion || '',
          colonia:business.colonia || '', municipio:business.municipio || '', maps:business.enlace_maps || '',
          galeria:[], promociones:[], horarios:[]
        }
      };
    }

    const banner=document.createElement('div');
    banner.className='admin-mode-banner';
    banner.style.cssText='position:sticky;top:0;z-index:1000;background:linear-gradient(90deg,#6424c8,#7d2ce0);color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;font-weight:700';
    banner.innerHTML=`<div><strong>Modo administrador</strong><br><span style="font-weight:500">Estás administrando ${esc(business.nombre)}${adminReadOnly ? '. Este negocio todavía no tiene una cuenta propietaria; el panel está en modo consulta.' : ''}</span></div><a href="dashboard.html" style="background:#22263a;color:#fff;padding:10px 16px;border-radius:12px;text-decoration:none;white-space:nowrap">Volver al panel administrativo</a>`;
    document.body.prepend(banner);
    document.querySelector('#welcome-title').textContent = `Administrando ${business.nombre}`;
    pre = {nombre_negocio:business.nombre};
    if(adminReadOnly){
      form.querySelectorAll('input,textarea,select,button').forEach(el=>{ if(!['preview-button'].includes(el.id)) el.disabled=true; });
      document.querySelector('#save-state').textContent='Solo consulta';
    }
  }else{
    const {data:adminFlag} = await supabase.rpc('es_administrador');
    isGlobalAdmin = Boolean(adminFlag);

    const memberships = await loadOwnerMemberships(authenticatedUser.id);
    activeOwnerMembership = memberships.find(item => item.negocio_id === activeContext.businessId) || null;

    if(activeOwnerMembership){
      rememberBusiness(activeContext.businessId);
      const business = activeOwnerMembership.negocios;
      publishedBusiness = business;
      draftOwnerId = authenticatedUser.id;

      const {data:draftData,error:draftError} = await supabase
        .from('perfiles_borrador')
        .select('*')
        .eq('negocio_id',activeOwnerMembership.negocio_id)
        .order('updated_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(draftError) throw draftError;

      draft = draftData || {
        usuario_id:authenticatedUser.id,
        negocio_id:activeOwnerMembership.negocio_id,
        estado:business?.activo ? 'publicado' : 'borrador',
        porcentaje:0,
        datos:businessToDraftData(business)
      };
      draft.usuario_id = authenticatedUser.id;
      draft.negocio_id = activeOwnerMembership.negocio_id;
      draft.datos = {...businessToDraftData(business), ...(draft.datos || {})};

      pre = {nombre_negocio:business?.nombre || 'tu negocio'};
      document.querySelector('#welcome-title').textContent = `Bienvenido a ${business?.nombre || 'tu negocio'} 👋`;
      document.querySelector('#account-status').textContent = ({
        propietario:'PROPIETARIO',
        administrador:'ADMINISTRADOR DEL NEGOCIO',
        colaborador:'COLABORADOR'
      })[activeOwnerMembership.rol] || 'MI NEGOCIO';
      renderOwnerRoleNavigation();
    }else{
      const {data:preData,error:preError} = await supabase.rpc('usuario_obtener_mi_pre_registro');
      if(preError) throw preError;
      pre = Array.isArray(preData) ? preData[0] : preData;
      if(!pre){
        clearActiveContext(authenticatedUser.id);
        location.replace('login.html?choose=1');
        return;
      }
      document.querySelector('#welcome-title').textContent = `Bienvenido, ${pre.nombre_negocio || 'tu negocio'} 👋`;
      const {data:draftData,error} = await supabase.from('perfiles_borrador').select('*').eq('usuario_id',authenticatedUser.id).maybeSingle();
      if(error) throw error;
      if(draftData){ draft = draftData; draftOwnerId = authenticatedUser.id; }
      else { draftOwnerId = authenticatedUser.id; draft.datos = {nombre:pre.nombre_negocio || '',categoria:pre.categoria || '',whatsapp:pre.whatsapp || '',municipio:pre.municipio || '',colonia:pre.colonia || '',galeria:[],promociones:[]}; }
      await loadPublishedBusiness();
      renderOwnerRoleNavigation();
    }
  }

  fill(draft.datos || {});
  updateProgress();
  renderNav();
  renderWorkflow();
  if(!adminMode){
    await showRulesIfNeeded();
    await renderAccountManagement();
    await initNotificationCenter();
  }
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
document.querySelector('#logout-button').onclick = async () => { clearActiveContext(user?.id); await supabase.auth.signOut(); location.replace('login.html'); };
document.querySelector('#submit-review').onclick = async () => {
  try{
    const percentage = updateProgress();
    if(percentage < 60){ showMessage('Completa al menos 60% del perfil antes de enviarlo.','error'); return; }
    const missing = missingFields(serialize());
    const detail = missing.length ? ` Aún faltan elementos recomendados: ${missing.join(', ')}.` : '';
    let approved=false; await new Promise(resolve=>openActionModal({title:'Enviar perfil a revisión',description:`Esta versión quedará bloqueada mientras administración la revisa.${detail ? `<br><br>${esc(detail)}` : ''}`,confirmText:'Enviar a revisión',onConfirm:async()=>{approved=true;resolve();}})); if(!approved)return;
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

const LEGAL_TERMS_VERSION='2026-07-22';
const LEGAL_PRIVACY_VERSION='2026-07-22';

try{ await init(); }catch(error){ console.error(error); showMessage(`No se pudo cargar el centro de configuración. ${error.message}`,'error',0); }


async function showRulesIfNeeded(){
  const {data}=await supabase.from('aceptaciones_legales').select('id').eq('usuario_id',user.id).eq('version_terminos',LEGAL_TERMS_VERSION).eq('version_privacidad',LEGAL_PRIVACY_VERSION).maybeSingle();
  if(data) return;
  const modal=document.querySelector('#rules-modal');
  const card=modal.querySelector('.rules-card');
  const steps=[
    {eyebrow:'BIENVENIDO',title:'Tu negocio dentro de Aliados Fantasma',body:'Este breve recorrido te mostrará cómo completar tu perfil, publicarlo y administrar su estado sin perder información.'},
    {eyebrow:'TU PERFIL',title:'Completa la información esencial',body:'Agrega logo, portada, descripción, horarios, ubicación, redes y promociones. Puedes guardar tu progreso y revisar una vista previa antes de enviarlo.'},
    {eyebrow:'PUBLICACIÓN',title:'Los cambios pasan por revisión',body:'Cuando envíes tu perfil, administración revisará la información. Una vez aprobado y publicado, los clientes podrán encontrarlo en el directorio.'},
    {eyebrow:'ESTADOS',title:'Administra la disponibilidad',body:'Puedes marcar el negocio como cerrado temporalmente y reabrirlo cuando quieras. También puedes solicitar su eliminación: se ocultará de inmediato y tendrás 30 días para cancelar.'},
    {eyebrow:'COMUNIDAD SEGURA',title:'Responsabilidades y posibles sanciones',body:'Un negocio puede ser suspendido por información falsa, promociones engañosas, suplantación, contenido ilegal u ofensivo, fraude, manipulación del sistema o incumplimiento reiterado. Un reporte no genera una suspensión automática: administración revisa cada caso y el negocio puede apelar.'}
  ];
  let index=0;
  const render=()=>{
    const final=index===steps.length-1;const item=steps[index];
    card.innerHTML=`<div class="tutorial-progress"><span style="width:${((index+1)/steps.length)*100}%"></span></div><p class="eyebrow">${item.eyebrow}</p><h2>${item.title}</h2><p class="tutorial-copy">${item.body}</p>${final?`<div class="notice warning"><strong>Lee antes de continuar.</strong> Las reglas completas se encuentran en los Términos y Condiciones y el tratamiento de datos en la Política de Privacidad.</div><label class="rules-check"><input id="rules-accept" type="checkbox"> He leído y comprendido los <a href="terminos.html" target="_blank">Términos y Condiciones</a> y la <a href="privacidad.html" target="_blank">Política de Privacidad</a>.</label>`:''}<div class="tutorial-actions"><button type="button" class="button secondary" id="tutorial-prev" ${index===0?'disabled':''}>Anterior</button><span>${index+1} de ${steps.length}</span>${final?'<button id="rules-confirm" class="button primary" type="button" disabled>Comenzar</button>':'<button type="button" class="button primary" id="tutorial-next">Siguiente</button>'}</div>`;
    card.querySelector('#tutorial-prev')?.addEventListener('click',()=>{index--;render();});
    card.querySelector('#tutorial-next')?.addEventListener('click',()=>{index++;render();});
    if(final){
      card.querySelector('#rules-accept').onchange=e=>card.querySelector('#rules-confirm').disabled=!e.target.checked;
      card.querySelector('#rules-confirm').onclick=async()=>{const button=card.querySelector('#rules-confirm');button.disabled=true;button.textContent='Guardando…';const {error}=await supabase.from('aceptaciones_legales').insert({usuario_id:user.id,version_terminos:LEGAL_TERMS_VERSION,version_privacidad:LEGAL_PRIVACY_VERSION});if(error){button.disabled=false;button.textContent='Comenzar';showMessage(error.message,'error');return;}modal.classList.add('hidden');showMessage('Tutorial completado. Bienvenido a Aliados Fantasma.');};
    }
  };
  modal.classList.remove('hidden');render();
}

function openActionModal({eyebrow='ALIADOS FANTASMA',title,description='',confirmText='Confirmar',danger=false,textarea=false,minLength=0,placeholder='',onConfirm}){
  document.querySelector('#af-action-modal')?.remove();
  const modal=document.createElement('div');
  modal.id='af-action-modal';
  modal.className='af-modal';
  modal.innerHTML=`<section class="af-modal-card" role="dialog" aria-modal="true" aria-labelledby="af-modal-title">
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h2 id="af-modal-title">${esc(title)}</h2>
    ${description?`<p class="af-modal-copy">${description}</p>`:''}
    ${textarea?`<label class="field"><span>Explicación</span><textarea id="af-modal-text" rows="6" minlength="${minLength}" placeholder="${esc(placeholder)}"></textarea><small class="field-help">Mínimo ${minLength} caracteres.</small></label>`:''}
    <div class="af-modal-actions"><button type="button" class="button secondary" data-af-cancel>Cancelar</button><button type="button" class="button ${danger?'danger':'primary'}" data-af-confirm>${esc(confirmText)}</button></div>
  </section>`;
  document.body.appendChild(modal);
  const input=modal.querySelector('#af-modal-text');
  const confirm=modal.querySelector('[data-af-confirm]');
  const sync=()=>{if(input)confirm.disabled=input.value.trim().length<minLength;};
  input?.addEventListener('input',sync); sync();
  const close=()=>modal.remove();
  modal.querySelector('[data-af-cancel]').onclick=close;
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.addEventListener('keydown',function escClose(e){if(e.key==='Escape'&&document.body.contains(modal)){close();document.removeEventListener('keydown',escClose);}});
  confirm.onclick=async()=>{
    confirm.disabled=true; const old=confirm.textContent; confirm.textContent='Procesando…';
    try{await onConfirm(input?.value.trim()||'');close();}
    catch(error){confirm.disabled=false;confirm.textContent=old;showMessage(error.message||'No fue posible completar la acción.','error');}
  };
  setTimeout(()=>input?.focus(),50);
}

function fmtLong(value){
  if(!value) return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX',{dateStyle:'long'}).format(date);
}

function openDeleteModal(onConfirm){
  document.querySelector('#delete-business-modal-runtime')?.remove();
  const modal=document.createElement('div');
  modal.id='delete-business-modal-runtime';
  modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:20px;backdrop-filter:blur(8px)';
  modal.innerHTML=`<section style="width:min(560px,100%);background:#11131a;border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.55)">
    <span style="display:inline-block;color:#ff7f9f;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem">Acción importante</span>
    <h2 style="margin:10px 0;color:#fff">Eliminar negocio</h2>
    <p style="color:#c8cad3;line-height:1.6">Tu negocio se ocultará inmediatamente. Tendrás <strong style="color:#fff">30 días</strong> para cancelar antes de que se elimine definitivamente.</p>
    <label style="display:block;margin-top:18px;color:#fff;font-weight:700">Escribe <strong>ELIMINAR</strong> para continuar</label>
    <input id="delete-confirm-word" autocomplete="off" style="width:100%;margin-top:8px;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:#090b10;color:#fff;font:inherit;outline:none" />
    <label style="display:flex;gap:10px;align-items:flex-start;margin-top:16px;color:#c8cad3;line-height:1.45"><input id="delete-confirm-check" type="checkbox" style="margin-top:3px"> <span>Entiendo que el perfil dejará de ser público desde este momento.</span></label>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px;flex-wrap:wrap">
      <button type="button" id="delete-cancel-runtime" class="button secondary">Cancelar</button>
      <button type="button" id="delete-submit-runtime" class="button danger" disabled>Programar eliminación</button>
    </div>
  </section>`;
  document.body.appendChild(modal);
  const input=modal.querySelector('#delete-confirm-word');
  const check=modal.querySelector('#delete-confirm-check');
  const submit=modal.querySelector('#delete-submit-runtime');
  const sync=()=>{ submit.disabled=!(input.value.trim()==='ELIMINAR' && check.checked); };
  input.addEventListener('input',sync);
  check.addEventListener('change',sync);
  modal.querySelector('#delete-cancel-runtime').onclick=()=>modal.remove();
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  submit.onclick=async()=>{
    submit.disabled=true;
    submit.textContent='Procesando…';
    try{ await onConfirm(); modal.remove(); }
    catch(error){ submit.disabled=false; submit.textContent='Programar eliminación'; showMessage(error.message||'No se pudo programar la eliminación.','error'); }
  };
  setTimeout(()=>input.focus(),50);
}

async function getOwnerBusinessState(negocioId){
  const {data,error}=await supabase.rpc('propietario_obtener_estado_negocio',{p_negocio_id:negocioId});
  if(error) throw error;
  return Array.isArray(data) ? data[0] : data;
}


async function renderOwnerNotifications(section){
  let box=section.querySelector('#owner-notifications');
  if(!box){box=document.createElement('div');box.id='owner-notifications';box.className='owner-notifications';section.appendChild(box);}
  const {data,error}=await supabase.from('notificaciones_plataforma').select('id,titulo,mensaje,tipo,leida,created_at').eq('usuario_id',user.id).order('created_at',{ascending:false}).limit(5);
  if(error){box.innerHTML='';return;}
  if(!data?.length){box.innerHTML='';return;}
  box.innerHTML=`<div class="owner-notifications-head"><div><p class="eyebrow">AVISOS</p><h3>Notificaciones recientes</h3></div></div><div class="owner-notifications-list">${data.map(n=>`<article class="owner-notification ${n.leida?'':'unread'}"><strong>${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p><small>${new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(n.created_at))}</small></article>`).join('')}</div>`;
  const unread=data.filter(n=>!n.leida).map(n=>n.id);if(unread.length)await supabase.from('notificaciones_plataforma').update({leida:true}).in('id',unread);
}

async function renderAccountManagement(){
  const section=document.querySelector('#account-management');
  const negocioId=draft.negocio_id || publishedBusiness?.id;
  if(!negocioId){section?.classList.add('hidden');return;}
  try{
    const b=await getOwnerBusinessState(negocioId);
    if(!b){section?.classList.add('hidden');return;}
    section.classList.remove('hidden');
    const state=b.estado_operativo||'activo';
    const labels={activo:'Activo',cerrado_temporalmente:'Cerrado temporalmente',suspendido:'Suspendido por administración',eliminacion_programada:'Eliminación programada'};
    let detail='Tu negocio está visible y funcionando normalmente.';
    if(state==='cerrado_temporalmente')detail='El perfil permanece visible, pero muestra que el negocio está cerrado temporalmente.';
    if(state==='suspendido')detail=`Motivo: ${b.motivo_suspension||'Consulta a administración.'}${b.suspendido_hasta?` · Hasta ${fmtLong(b.suspendido_hasta)}`:''}`;
    if(state==='eliminacion_programada')detail=`Tu negocio ya está oculto. Se eliminará definitivamente el ${fmtLong(b.eliminacion_programada_at)}. Puedes cancelar antes de esa fecha.`;
    document.querySelector('#account-state-card').innerHTML=`<span class="state-dot ${state}"></span><div><strong>${labels[state]||state}</strong><p>${detail}</p></div>`;
    const actions=[];
    if(state==='activo')actions.push('<button class="button secondary" data-close-temp>Cerrar temporalmente</button><button class="button danger" data-delete-account>Eliminar cuenta</button>');
    if(state==='cerrado_temporalmente')actions.push('<button class="button primary" data-reopen>Reabrir negocio</button><button class="button danger" data-delete-account>Eliminar cuenta</button>');
    if(state==='eliminacion_programada')actions.push('<button class="button primary" data-cancel-delete>Cancelar eliminación</button>');
    if(state==='suspendido')actions.push('<button class="button secondary" data-appeal>Presentar apelación</button>');
    document.querySelector('#account-actions').innerHTML=actions.join('');

    document.querySelector('[data-close-temp]')?.addEventListener('click',async()=>{
      openActionModal({title:'Cerrar temporalmente',description:'El perfil continuará visible, pero mostrará claramente que el negocio está cerrado temporalmente. Podrás reabrirlo cuando quieras.',confirmText:'Cerrar temporalmente',onConfirm:async()=>{const {error}=await supabase.rpc('propietario_cerrar_temporalmente',{p_negocio_id:b.id});if(error)throw error;await renderAccountManagement();showMessage('Tu negocio ahora aparece como cerrado temporalmente.');}});
    });
    document.querySelector('[data-reopen]')?.addEventListener('click',async()=>{
      const {error}=await supabase.rpc('propietario_reabrir_negocio',{p_negocio_id:b.id});
      if(error)return showMessage(error.message,'error');
      await renderAccountManagement();
      showMessage('Tu negocio volvió a estar activo.');
    });
    document.querySelector('[data-delete-account]')?.addEventListener('click',()=>openDeleteModal(async()=>{
      const {data,error}=await supabase.rpc('propietario_solicitar_eliminacion',{p_negocio_id:b.id});
      if(error)throw error;
      await renderAccountManagement();
      showMessage(`El negocio quedó oculto. Puedes cancelar la eliminación hasta el ${fmtLong(data)}.`,'warning',9000);
    }));
    document.querySelector('[data-cancel-delete]')?.addEventListener('click',async()=>{
      openActionModal({title:'Cancelar eliminación',description:'El negocio volverá a estar activo y visible. Se cancelará definitivamente la cuenta regresiva de eliminación.',confirmText:'Cancelar eliminación',onConfirm:async()=>{const {error}=await supabase.rpc('propietario_cancelar_eliminacion',{p_negocio_id:b.id});if(error)throw error;await loadPublishedBusiness();await renderAccountManagement();renderProfileAccess();showMessage('La eliminación fue cancelada y el negocio volvió a estar activo.');}});
    });
    document.querySelector('[data-appeal]')?.addEventListener('click',async()=>{
      openActionModal({eyebrow:'DERECHO DE REVISIÓN',title:'Presentar apelación',description:'Explica con claridad por qué consideras que la suspensión debe revisarse. La apelación no reactiva automáticamente el perfil.',confirmText:'Enviar apelación',textarea:true,minLength:20,placeholder:'Describe los hechos y cualquier información que administración deba considerar…',onConfirm:async text=>{const {error}=await supabase.from('apelaciones_suspension').insert({negocio_id:b.id,usuario_id:user.id,explicacion:text});if(error)throw error;showMessage('Apelación enviada a administración.');}});
    });

  }catch(error){
    console.error('No fue posible cargar el estado del negocio:',error);
    section.classList.remove('hidden');
    document.querySelector('#account-state-card').innerHTML='<div><strong>No pudimos consultar el estado</strong><p>Actualiza la página después de instalar el hotfix SQL.</p></div>';
    document.querySelector('#account-actions').innerHTML='';
    showMessage(`No se pudo consultar el estado del negocio. ${error.message}`,'error',0);
  }
}


// ============================================================
// CENTRO DE NOTIFICACIONES DEL NEGOCIO
// ============================================================
let notificationRows = [];
let notificationFilter = 'all';

function notificationDate(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(date);
}

function notificationIcon(type=''){
  if(type.includes('suspension')) return '🛡️';
  if(type.includes('apelacion')) return '⚖️';
  if(type.includes('reporte')) return '🚩';
  if(type.includes('perfil') || type.includes('aprob')) return '✅';
  if(type.includes('terminos') || type.includes('legal')) return '📜';
  return '📢';
}

function ensureNotificationCenter(){
  if(document.querySelector('#notification-center-runtime')) return;
  const root=document.createElement('div');
  root.id='notification-center-runtime';
  root.innerHTML=`
    <button type="button" class="notification-bell" id="notification-bell" aria-label="Abrir notificaciones" aria-expanded="false">
      <span aria-hidden="true">🔔</span><span class="notification-badge hidden" id="notification-badge">0</span>
    </button>
    <div class="notification-backdrop hidden" id="notification-backdrop"></div>
    <aside class="notification-drawer" id="notification-drawer" aria-hidden="true" aria-label="Centro de notificaciones">
      <header class="notification-drawer-head">
        <div><p class="eyebrow">CENTRO DE AVISOS</p><h2>Notificaciones</h2></div>
        <button type="button" class="notification-close" id="notification-close" aria-label="Cerrar">×</button>
      </header>
      <div class="notification-toolbar">
        <div class="notification-tabs">
          <button type="button" data-notification-filter="all" class="active">Todas</button>
          <button type="button" data-notification-filter="unread">Sin leer</button>
          <button type="button" data-notification-filter="important">Importantes</button>
        </div>
        <div class="notification-bulk-actions">
          <button type="button" id="notifications-read-all">Marcar todas como leídas</button>
          <button type="button" id="notifications-delete-read">Eliminar leídas</button>
        </div>
      </div>
      <div class="notification-list" id="notification-list"></div>
    </aside>`;
  document.body.appendChild(root);
  const bell=root.querySelector('#notification-bell');
  const drawer=root.querySelector('#notification-drawer');
  const backdrop=root.querySelector('#notification-backdrop');
  const setOpen=open=>{
    drawer.classList.toggle('open',open);
    drawer.setAttribute('aria-hidden',String(!open));
    bell.setAttribute('aria-expanded',String(open));
    backdrop.classList.toggle('hidden',!open);
    document.body.classList.toggle('notifications-open',open);
  };
  bell.onclick=()=>setOpen(true);
  root.querySelector('#notification-close').onclick=()=>setOpen(false);
  backdrop.onclick=()=>setOpen(false);
  root.querySelectorAll('[data-notification-filter]').forEach(button=>button.onclick=()=>{
    notificationFilter=button.dataset.notificationFilter;
    root.querySelectorAll('[data-notification-filter]').forEach(item=>item.classList.toggle('active',item===button));
    renderNotificationList();
  });
  root.querySelector('#notifications-read-all').onclick=markAllNotificationsRead;
  root.querySelector('#notifications-delete-read').onclick=deleteReadNotifications;
}

async function fetchNotifications(){
  const {data,error}=await supabase.from('notificaciones_plataforma')
    .select('id,titulo,mensaje,tipo,leida,leida_at,importante,obligatoria,created_at')
    .eq('usuario_id',user.id)
    .order('created_at',{ascending:false})
    .limit(100);
  if(error) throw error;
  notificationRows=data||[];
  renderNotificationList();
  updateNotificationBadge();
  renderUnreadNotificationSpotlight();
}

function updateNotificationBadge(){
  const badge=document.querySelector('#notification-badge');
  if(!badge) return;
  const count=notificationRows.filter(item=>!item.leida).length;
  badge.textContent=count>99?'99+':String(count);
  badge.classList.toggle('hidden',count===0);
}

function filteredNotifications(){
  if(notificationFilter==='unread') return notificationRows.filter(item=>!item.leida);
  if(notificationFilter==='important') return notificationRows.filter(item=>item.importante || item.obligatoria);
  return notificationRows;
}

function renderNotificationList(){
  const list=document.querySelector('#notification-list');
  if(!list) return;
  const rows=filteredNotifications();
  if(!rows.length){
    list.innerHTML='<div class="notification-empty"><span>🔔</span><strong>No hay notificaciones aquí</strong><p>Los avisos de tu cuenta aparecerán en esta bandeja.</p></div>';
    return;
  }
  list.innerHTML=rows.map(item=>`<article class="notification-item ${item.leida?'read':'unread'} ${item.importante?'important':''}" data-notification-id="${item.id}">
    <div class="notification-type-icon">${notificationIcon(item.tipo)}</div>
    <div class="notification-copy">
      <div class="notification-title-row"><strong>${esc(item.titulo)}</strong>${item.obligatoria?'<span class="notification-pin">Obligatoria</span>':item.importante?'<span class="notification-pin">Importante</span>':''}</div>
      <p>${esc(item.mensaje)}</p><small>${notificationDate(item.created_at)}${item.leida_at?` · Leída ${notificationDate(item.leida_at)}`:''}</small>
      <div class="notification-actions">
        ${item.leida?'<button type="button" data-mark-unread>Marcar sin leer</button>':'<button type="button" data-mark-read>Marcar como leída</button>'}
        <button type="button" data-toggle-important>${item.importante?'Quitar importante':'Marcar importante'}</button>
        <button type="button" data-delete-notification class="danger" ${item.obligatoria&&!item.leida?'disabled title="Primero debes leer este aviso"':''}>Eliminar</button>
      </div>
    </div>
  </article>`).join('');
  list.querySelectorAll('[data-notification-id]').forEach(card=>{
    const id=card.dataset.notificationId;
    card.querySelector('[data-mark-read]')?.addEventListener('click',()=>setNotificationRead(id,true));
    card.querySelector('[data-mark-unread]')?.addEventListener('click',()=>setNotificationRead(id,false));
    card.querySelector('[data-toggle-important]')?.addEventListener('click',()=>toggleNotificationImportant(id));
    card.querySelector('[data-delete-notification]')?.addEventListener('click',()=>deleteNotification(id));
  });
}

async function setNotificationRead(id,read=true){
  const patch={leida:read,leida_at:read?new Date().toISOString():null};
  const {error}=await supabase.from('notificaciones_plataforma').update(patch).eq('id',id).eq('usuario_id',user.id);
  if(error) return showMessage(error.message,'error');
  const row=notificationRows.find(item=>item.id===id);
  if(row) Object.assign(row,patch);
  renderNotificationList();updateNotificationBadge();renderUnreadNotificationSpotlight();
}

async function toggleNotificationImportant(id){
  const row=notificationRows.find(item=>item.id===id); if(!row)return;
  const {error}=await supabase.from('notificaciones_plataforma').update({importante:!row.importante}).eq('id',id).eq('usuario_id',user.id);
  if(error) return showMessage(error.message,'error');
  row.importante=!row.importante;renderNotificationList();
}

async function deleteNotification(id){
  const row=notificationRows.find(item=>item.id===id); if(!row)return;
  if(row.obligatoria&&!row.leida){showMessage('Primero abre o marca como leído este aviso obligatorio.','warning');return;}
  openActionModal({title:'Eliminar notificación',description:'Se eliminará de tu bandeja y no podrá recuperarse.',confirmText:'Eliminar',onConfirm:async()=>{
    const {error}=await supabase.from('notificaciones_plataforma').delete().eq('id',id).eq('usuario_id',user.id);
    if(error)throw error;
    notificationRows=notificationRows.filter(item=>item.id!==id);renderNotificationList();updateNotificationBadge();renderUnreadNotificationSpotlight();
  }});
}

async function markAllNotificationsRead(){
  const ids=notificationRows.filter(item=>!item.leida).map(item=>item.id);
  if(!ids.length)return showMessage('No tienes notificaciones pendientes.');
  const now=new Date().toISOString();
  const {error}=await supabase.from('notificaciones_plataforma').update({leida:true,leida_at:now}).in('id',ids).eq('usuario_id',user.id);
  if(error)return showMessage(error.message,'error');
  notificationRows.forEach(item=>{if(ids.includes(item.id)){item.leida=true;item.leida_at=now;}});
  renderNotificationList();updateNotificationBadge();renderUnreadNotificationSpotlight();showMessage('Todas las notificaciones fueron marcadas como leídas.');
}

async function deleteReadNotifications(){
  const deletable=notificationRows.filter(item=>item.leida).map(item=>item.id);
  if(!deletable.length)return showMessage('No hay notificaciones leídas para eliminar.');
  openActionModal({title:'Eliminar notificaciones leídas',description:`Se eliminarán ${deletable.length} notificaciones de tu bandeja.`,confirmText:'Eliminar leídas',onConfirm:async()=>{
    const {error}=await supabase.from('notificaciones_plataforma').delete().in('id',deletable).eq('usuario_id',user.id);
    if(error)throw error;
    notificationRows=notificationRows.filter(item=>!deletable.includes(item.id));renderNotificationList();updateNotificationBadge();renderUnreadNotificationSpotlight();
  }});
}

function renderUnreadNotificationSpotlight(){
  let spotlight=document.querySelector('#notification-spotlight-runtime');
  if(!spotlight){
    spotlight=document.createElement('section');spotlight.id='notification-spotlight-runtime';spotlight.className='notification-spotlight hidden';
    const target=document.querySelector('#admin-feedback') || document.querySelector('#workflow-card') || document.querySelector('main');
    target?.parentNode?.insertBefore(spotlight,target);
  }
  const item=notificationRows.find(row=>!row.leida);
  if(!item){spotlight.classList.add('hidden');spotlight.innerHTML='';return;}
  spotlight.classList.remove('hidden');
  spotlight.innerHTML=`<div class="notification-spotlight-icon">${notificationIcon(item.tipo)}</div><div><span>Nuevo aviso</span><strong>${esc(item.titulo)}</strong><p>${esc(item.mensaje)}</p></div><div class="notification-spotlight-actions"><button type="button" class="button secondary small" data-open-center>Ver notificaciones</button><button type="button" class="button primary small" data-read-spotlight>Entendido</button></div>`;
  spotlight.querySelector('[data-open-center]').onclick=()=>document.querySelector('#notification-bell')?.click();
  spotlight.querySelector('[data-read-spotlight]').onclick=()=>setNotificationRead(item.id,true);
}

async function initNotificationCenter(){
  ensureNotificationCenter();
  try{await fetchNotifications();}
  catch(error){console.error('No fue posible cargar las notificaciones:',error);}
}

// CENTRO DE MARKETING v2.8
function ensureMarketingCenterAccess(){
  const sidebar=document.querySelector('.owner-sidebar');
  if(!sidebar || document.querySelector('#marketing-center-link')) return;
  const footer=sidebar.querySelector('.sidebar-footer');
  const link=document.createElement('a');
  link.id='marketing-center-link';
  link.href=adminMode ? `marketing.html?admin_business=${encodeURIComponent(adminBusinessId)}` : 'marketing.html';
  link.className='button marketing-center-link full';
  link.innerHTML='<span aria-hidden="true">📣</span><span>Centro de Marketing</span>';
  link.style.cssText='display:flex;align-items:center;justify-content:center;gap:10px;margin:14px 16px 10px;min-height:48px;text-decoration:none;background:linear-gradient(135deg,rgba(91,61,196,.28),rgba(0,149,255,.18));border:1px solid rgba(161,111,255,.45);color:#fff;border-radius:12px;font-weight:800;';
  if(footer) sidebar.insertBefore(link,footer); else sidebar.appendChild(link);
}

// El script se carga como módulo al final de panel.html. En ese punto el DOM ya puede
// estar listo, por lo que no debemos depender únicamente de DOMContentLoaded.
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ensureMarketingCenterAccess, { once:true });
}else{
  ensureMarketingCenterAccess();
}

// Segundo intento después de que el panel termine de pintar sus componentes dinámicos.
window.setTimeout(ensureMarketingCenterAccess, 250);
