import { supabase } from './supabase-client.js?v=20260720-310';
import { esc } from './ui.js?v=20260720-600';
import { canAccessPublicAreaBeforeLaunch, LAUNCH_LABEL } from './launch-control.js?v=20260723-900';

const params = new URLSearchParams(location.search);
const slug = params.get('slug');
const businessId = params.get('business_id');
const adminPreviewId = params.get('admin_preview');
const previewMode = params.get('preview') === '1';
const source = params.get('from');
const root = document.querySelector('#profile-root');
const backLink = document.querySelector('#profile-back-link');
const previewBanner = document.querySelector('#preview-banner');
const navShare = document.querySelector('#nav-share');
const toast = document.querySelector('#profile-toast');
const lightbox = document.querySelector('#lightbox');
const reportModal=document.querySelector('#report-modal');
const reportForm=document.querySelector('#report-form');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxCaption = document.querySelector('#lightbox-caption');
let galleryItems = [];
let lightboxIndex = 0;
let currentProfile = null;

const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DB_DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function configureBackRoute(){
  if(adminPreviewId){backLink.href='solicitudes.html';backLink.textContent='← Regresar a solicitudes';return;}
  if(previewMode || source==='panel'){backLink.href='panel.html';backLink.textContent='← Regresar a mi dashboard';return;}
  backLink.href='explorar.html';backLink.textContent='← Explorar negocios';
}
configureBackRoute();
const reportButton=document.createElement('button');reportButton.id='nav-report';reportButton.className='profile-nav-action';reportButton.type='button';reportButton.textContent='Reportar';navShare.before(reportButton);

function showToast(message){
  toast.textContent=message;toast.classList.remove('hidden');
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.add('hidden'),2600);
}

function safeUrl(value){
  const text=String(value||'').trim();
  if(!text)return '';
  try{const u=new URL(text,location.href);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}
}

function whatsappUrl(number,name=''){const digits=String(number||'').replace(/\D/g,'');return digits?`https://wa.me/${digits}?text=${encodeURIComponent(`Hola, vi el perfil de ${name} en Aliados Fantasma.`)}`:'';}
function fullAddress(b){return [b.direccion,b.colonia,b.municipio,b.estado_region,b.codigo_postal].filter(Boolean).join(', ');}
function formatTime(value){return String(value||'').slice(0,5);}
function formatDate(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric'}).format(d);}
function socialName(platform=''){const key=platform.toLowerCase().trim();return ({facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube','sitio web':'Sitio web',web:'Sitio web',whatsapp:'WhatsApp'})[key]||platform;}
function mapEmbed(address){return address?`https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`:'';}

function normalizeDraft(d){
  const b=d.datos||{};
  return {
    id:d.negocio_id||'',slug:'',nombre:b.nombre||'Tu negocio',categoria:b.categoria||'Negocio aliado',descripcion_corta:b.descripcion_corta||'',descripcion:b.descripcion||b.descripcion_corta||'',whatsapp:b.whatsapp||'',telefono:b.telefono||'',correo:b.correo||'',sitio_web:b.web||'',direccion:b.direccion||'',colonia:b.colonia||'',municipio:b.municipio||'',estado_region:'Estado de México',codigo_postal:'',enlace_maps:b.maps||'',logo_url:b.logo_url||'',portada_url:b.portada_url||'',destacado:false,
    horarios:(b.horarios||[]).map((x,i)=>({dia_semana:i+1,hora_apertura:x.abre,hora_cierre:x.cierra,cerrado:!!x.cerrado})),
    redes:[['facebook',b.facebook],['instagram',b.instagram],['tiktok',b.tiktok],['youtube',b.youtube],['sitio web',b.web]].filter(x=>x[1]).map(([plataforma,value])=>({plataforma,url:/^https?:\/\//i.test(value)?value:({facebook:`https://facebook.com/${value}`,instagram:`https://instagram.com/${value}`,tiktok:`https://tiktok.com/@${value}`,youtube:`https://youtube.com/@${value}`,'sitio web':value})[plataforma]})),
    galeria:(b.galeria||[]).map((imagen_url,orden)=>({imagen_url,orden})),promociones:(b.promociones||[]).map(x=>({titulo:x.titulo,descripcion:x.descripcion,fecha_fin:x.vigencia,activa:true}))
  };
}

function getOpenState(schedules=[]){
  if(!schedules.length)return {label:'Horario no disponible',className:''};
  const now=new Date();const jsDay=now.getDay();const dbDay=jsDay===0?7:jsDay;
  const today=schedules.find(x=>Number(x.dia_semana)===dbDay);
  if(!today||today.cerrado)return {label:'Cerrado hoy',className:'closed'};
  const nowMinutes=now.getHours()*60+now.getMinutes();
  const toMinutes=v=>{const [h,m]=formatTime(v).split(':').map(Number);return h*60+m;};
  const open=toMinutes(today.hora_apertura),close=toMinutes(today.hora_cierre);
  if(Number.isFinite(open)&&Number.isFinite(close)&&nowMinutes>=open&&nowMinutes<close)return {label:`Abierto · cierra ${formatTime(today.hora_cierre)}`,className:'open'};
  if(Number.isFinite(open)&&nowMinutes<open)return {label:`Cerrado · abre ${formatTime(today.hora_apertura)}`,className:'closed'};
  return {label:'Cerrado ahora',className:'closed'};
}

function updateSeo(p,isPreview){
  const title=`${p.nombre} | Aliados Fantasma`;
  const description=(p.descripcion_corta||p.descripcion||`Conoce ${p.nombre} en Aliados Fantasma.`).slice(0,160);
  const canonical=new URL(`perfil.html${p.slug?`?slug=${encodeURIComponent(p.slug)}`:''}`,location.href).href;
  const image=safeUrl(p.portada_url)||safeUrl(p.logo_url)||new URL('aliados-fantasma-logo.png',location.href).href;
  document.title=title;
  const set=(selector,attr,value)=>{const el=document.querySelector(selector);if(el)el.setAttribute(attr,value);};
  set('meta[name="description"]','content',description);set('meta[property="og:title"]','content',title);set('meta[property="og:description"]','content',description);set('meta[property="og:image"]','content',image);set('meta[property="og:url"]','content',canonical);set('link[rel="canonical"]','href',canonical);set('meta[name="robots"]','content',isPreview?'noindex,nofollow':'index,follow,max-image-preview:large');
  document.querySelector('#business-schema')?.remove();
  if(!isPreview){
    const schema={"@context":"https://schema.org","@type":"LocalBusiness",name:p.nombre,description,address:{"@type":"PostalAddress",streetAddress:p.direccion||'',addressLocality:p.municipio||'',addressRegion:p.estado_region||'Estado de México',postalCode:p.codigo_postal||'',addressCountry:'MX'},url:canonical,image:[p.logo_url,p.portada_url,...p.galeria.map(x=>x.imagen_url)].filter(Boolean),telephone:p.telefono||p.whatsapp||undefined,sameAs:p.redes.map(x=>x.url).filter(Boolean),openingHoursSpecification:p.horarios.filter(x=>!x.cerrado).map(x=>({"@type":"OpeningHoursSpecification",dayOfWeek:DB_DAYS[Number(x.dia_semana)-1],opens:formatTime(x.hora_apertura),closes:formatTime(x.hora_cierre)}))};
    const script=document.createElement('script');script.id='business-schema';script.type='application/ld+json';script.textContent=JSON.stringify(schema);document.head.appendChild(script);
  }
}

function galleryMarkup(items,name){
  if(!items.length)return '<div class="empty-media">Este negocio todavía no ha agregado fotografías.</div>';
  return items.slice(0,5).map((item,i)=>`<button class="gallery-photo" type="button" data-gallery-index="${i}" aria-label="Abrir imagen ${i+1} de ${esc(name)}"><img src="${esc(item.imagen_url)}" alt="${esc(name)} — fotografía ${i+1}" loading="lazy" decoding="async">${i===4&&items.length>5?`<span class="gallery-more">+${items.length-5} fotos</span>`:''}</button>`).join('');
}

function promotionsMarkup(items=[]){
  const active=items.filter(x=>x.activa!==false&&(!x.fecha_fin||new Date(x.fecha_fin)>=new Date()));
  if(!active.length)return '<div class="empty-media">No hay promociones activas por el momento.</div>';
  return `<div class="promotion-grid">${active.map(x=>`<article class="promotion-card"><h3>${esc(x.titulo||'Promoción especial')}</h3><p>${esc(x.descripcion||'Consulta condiciones directamente con el negocio.')}</p>${x.fecha_fin?`<span class="promotion-validity">Válida hasta ${esc(formatDate(x.fecha_fin))}</span>`:''}</article>`).join('')}</div>`;
}

function scheduleMarkup(items=[]){
  if(!items.length)return '<p class="muted">Sin horarios registrados.</p>';
  const todayDb=new Date().getDay()===0?7:new Date().getDay();
  return `<div class="schedule-list">${items.map(x=>`<div class="schedule-row ${Number(x.dia_semana)===todayDb?'today':''}"><span>${esc(DB_DAYS[Number(x.dia_semana)-1]||`Día ${x.dia_semana}`)}</span><span>${x.cerrado?'Cerrado':`${esc(formatTime(x.hora_apertura))} – ${esc(formatTime(x.hora_cierre))}`}</span></div>`).join('')}</div>`;
}

function vcard(p){
  return ['BEGIN:VCARD','VERSION:3.0',`FN:${p.nombre}`,`ORG:${p.nombre}`,p.telefono?`TEL;TYPE=WORK:${p.telefono}`:'',p.whatsapp?`TEL;TYPE=CELL:${p.whatsapp}`:'',p.correo?`EMAIL:${p.correo}`:'',p.sitio_web?`URL:${p.sitio_web}`:'',fullAddress(p)?`ADR:;;${fullAddress(p)};;;;`:'','END:VCARD'].filter(Boolean).join('\r\n');
}

function renderProfile(p,{isPreview=false}={}){
  currentProfile=p;
  currentProfile=p;galleryItems=p.galeria||[];updateSeo(p,isPreview);
  document.documentElement.style.setProperty('--profile-primary',p.color_primario||'#a855f7');
  document.documentElement.style.setProperty('--profile-secondary',p.color_secundario||'#22d3ee');
  previewBanner.classList.toggle('hidden',!isPreview);
  navShare.classList.remove('hidden');
  const address=fullAddress(p);const open=getOpenState(p.horarios);const whatsapp=whatsappUrl(p.whatsapp,p.nombre);const maps=safeUrl(p.enlace_maps);const site=safeUrl(p.sitio_web);const shareUrl=p.slug?new URL(`perfil.html?slug=${encodeURIComponent(p.slug)}`,location.href).href:location.href;
  const badges=[p.destacado?'⭐ Destacado':'🤝 Aliado Fantasma',isPreview?'Vista previa privada':'Perfil oficial'];
  root.innerHTML=`
    <header class="profile-cover reveal" ${p.portada_url?`style="background-image:url('${esc(p.portada_url)}')"`:''}>
      <div class="profile-cover-inner"><div class="profile-identity">
        <div class="profile-main-logo">${p.logo_url?`<img src="${esc(p.logo_url)}" alt="Logo de ${esc(p.nombre)}" width="160" height="160">`:esc((p.nombre||'A').charAt(0))}</div>
        <div><p class="profile-category">${esc(p.categoria||'Negocio aliado')}</p><h1 class="profile-title">${esc(p.nombre)}</h1><p class="profile-tagline">${esc(p.descripcion_corta||'Conoce este negocio local.')}</p><div class="profile-badges"><span class="open-status ${open.className}">● ${esc(open.label)}</span>${badges.map(x=>`<span class="profile-badge">${esc(x)}</span>`).join('')}</div></div>
      </div></div>
    </header>
    <div class="profile-action-bar reveal" aria-label="Acciones principales">
      <a class="profile-action primary" ${whatsapp?`href="${esc(whatsapp)}" target="_blank" rel="noopener"`:'hidden'}>💬 WhatsApp</a>
      <a class="profile-action" ${maps?`href="${esc(maps)}" target="_blank" rel="noopener"`:'hidden'}>📍 Cómo llegar</a>
      <a class="profile-action" ${p.telefono?`href="tel:${esc(String(p.telefono).replace(/[^+\d]/g,''))}"`:'hidden'}>📞 Llamar</a>
      <button class="profile-action" id="share-button" type="button">↗ Compartir</button>
      <button class="profile-action" id="vcard-button" type="button">＋ Guardar contacto</button>
    </div>
    <main id="profile-main" class="profile-main"><div class="profile-layout">
      <div>
        <section class="profile-section reveal"><div class="profile-section-heading"><div><p class="eyebrow">CONOCE EL NEGOCIO</p><h2>Sobre ${esc(p.nombre)}</h2></div></div><div class="profile-about">${esc(p.descripcion||p.descripcion_corta||'Información próximamente.')}</div></section>
        <section class="profile-section reveal"><div class="profile-section-heading"><div><p class="eyebrow">IMÁGENES</p><h2>Galería</h2></div><p>${galleryItems.length?`${galleryItems.length} fotografía${galleryItems.length===1?'':'s'}`:''}</p></div><div class="premium-gallery">${galleryMarkup(galleryItems,p.nombre)}</div></section>
        <section class="profile-section reveal"><div class="profile-section-heading"><div><p class="eyebrow">OPORTUNIDADES</p><h2>Promociones activas</h2></div></div>${promotionsMarkup(p.promociones)}</section>
        ${address?`<section class="profile-section reveal"><div class="profile-section-heading"><div><p class="eyebrow">UBICACIÓN</p><h2>Encuéntranos</h2></div></div><iframe class="profile-map" src="${esc(mapEmbed(address))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa de ${esc(p.nombre)}"></iframe>${maps?`<a class="map-link" href="${esc(maps)}" target="_blank" rel="noopener">Abrir ruta en Google Maps →</a>`:''}</section>`:''}
      </div>
      <aside>
        <section class="profile-section profile-contact-card reveal"><p class="eyebrow">INFORMACIÓN</p><h2>Datos del negocio</h2><div class="profile-facts">
          ${address?`<div class="profile-fact"><small>Dirección</small><strong>${esc(address)}</strong></div>`:''}
          ${p.telefono?`<div class="profile-fact"><small>Teléfono</small><a href="tel:${esc(String(p.telefono).replace(/[^+\d]/g,''))}">${esc(p.telefono)}</a></div>`:''}
          ${p.correo?`<div class="profile-fact"><small>Correo</small><a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a></div>`:''}
          ${site?`<div class="profile-fact"><small>Sitio web</small><a href="${esc(site)}" target="_blank" rel="noopener">Visitar sitio →</a></div>`:''}
        </div><h3>Horarios</h3>${scheduleMarkup(p.horarios)}
        ${p.redes.length?`<h3>Redes sociales</h3><div class="profile-socials">${p.redes.map(x=>`<a class="profile-social" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(socialName(x.plataforma))}</a>`).join('')}</div>`:''}
        <div class="profile-qr"><h3>Comparte este perfil</h3><img src="https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=${encodeURIComponent(shareUrl)}" alt="Código QR del perfil de ${esc(p.nombre)}" loading="lazy"><p>Escanea o guarda este código para volver al perfil.</p><button class="button secondary full" id="qr-download" type="button">Descargar QR</button></div>
        </section>
      </aside>
    </div></main>
    <footer class="profile-footer"><img src="aliados-fantasma-icono.webp" alt="" width="54" height="54"><div><strong>${esc(p.nombre)}</strong> forma parte de Aliados Fantasma.</div><small>La información es proporcionada por cada negocio.</small></footer>
    ${whatsapp?`<a class="profile-floating-whatsapp" href="${esc(whatsapp)}" target="_blank" rel="noopener" aria-label="Contactar por WhatsApp">💬 <span>Contactar</span></a>`:''}`;

  document.querySelectorAll('[data-gallery-index]').forEach(btn=>btn.addEventListener('click',()=>openLightbox(Number(btn.dataset.galleryIndex))));
  document.querySelector('#share-button')?.addEventListener('click',shareProfile);
  document.querySelector('#vcard-button')?.addEventListener('click',()=>downloadBlob(vcard(p),`${slugify(p.nombre)}.vcf`,'text/vcard;charset=utf-8'));
  document.querySelector('#qr-download')?.addEventListener('click',()=>downloadQr(shareUrl,p.nombre));
}

function slugify(text){return String(text||'contacto').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function downloadBlob(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('Archivo preparado');}
async function downloadQr(url,name){try{const qr=`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=24&data=${encodeURIComponent(url)}`;const r=await fetch(qr);if(!r.ok)throw new Error();const blob=await r.blob();const local=URL.createObjectURL(blob);const a=document.createElement('a');a.href=local;a.download=`qr-${slugify(name)}.png`;a.click();URL.revokeObjectURL(local);showToast('QR descargado');}catch{window.open(`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(url)}`,'_blank','noopener');}}
async function shareProfile(){if(!currentProfile)return;const url=currentProfile.slug?new URL(`perfil.html?slug=${encodeURIComponent(currentProfile.slug)}`,location.href).href:location.href;const data={title:currentProfile.nombre,text:currentProfile.descripcion_corta||`Conoce ${currentProfile.nombre} en Aliados Fantasma`,url};try{if(navigator.share){await navigator.share(data);}else{await navigator.clipboard.writeText(url);showToast('Enlace copiado');}}catch(e){if(e?.name!=='AbortError')showToast('No fue posible compartir');}}
navShare.addEventListener('click',shareProfile);

function openLightbox(index){if(!galleryItems.length)return;lightboxIndex=Math.max(0,Math.min(index,galleryItems.length-1));const item=galleryItems[lightboxIndex];lightboxImage.src=item.imagen_url;lightboxImage.alt=`Imagen ${lightboxIndex+1} de ${currentProfile?.nombre||'negocio'}`;lightboxCaption.textContent=`${lightboxIndex+1} de ${galleryItems.length}`;lightbox.classList.remove('hidden');document.body.style.overflow='hidden';document.querySelector('#lightbox-close').focus();}
function closeLightbox(){lightbox.classList.add('hidden');document.body.style.overflow='';}
function moveLightbox(step){if(!galleryItems.length)return;openLightbox((lightboxIndex+step+galleryItems.length)%galleryItems.length);}
document.querySelector('#lightbox-close').addEventListener('click',closeLightbox);document.querySelector('#lightbox-prev').addEventListener('click',()=>moveLightbox(-1));document.querySelector('#lightbox-next').addEventListener('click',()=>moveLightbox(1));lightbox.addEventListener('click',e=>{if(e.target===lightbox)closeLightbox();});document.addEventListener('keydown',e=>{if(lightbox.classList.contains('hidden'))return;if(e.key==='Escape')closeLightbox();if(e.key==='ArrowLeft')moveLightbox(-1);if(e.key==='ArrowRight')moveLightbox(1);});

function errorState(title,message,actions=''){previewBanner.classList.add('hidden');navShare.classList.add('hidden');root.innerHTML=`<main class="profile-error"><div><p class="eyebrow">ALIADOS FANTASMA</p><h1>${esc(title)}</h1><p class="muted">${esc(message)}</p><div class="actions" style="justify-content:center">${actions}</div></div></main>`;}

async function load(){
  try{
    if(previewMode||adminPreviewId){
      const {data:{user}}=await supabase.auth.getUser();if(!user){location.replace('login.html');return;}
      const targetUser=adminPreviewId||user.id;const {data:draft,error}=await supabase.from('perfiles_borrador').select('*').eq('usuario_id',targetUser).maybeSingle();
      if(error||!draft){errorState('Aún no existe una vista previa','Configura el perfil desde el dashboard.','<a class="button primary" href="panel.html">Configurar perfil</a>');return;}
      renderProfile(normalizeDraft(draft),{isPreview:true});return;
    }
    previewBanner.classList.add('hidden');
    if(!await canAccessPublicAreaBeforeLaunch()){errorState('Este perfil todavía no es público',`La red se habilitará automáticamente el ${LAUNCH_LABEL}.`,'<a class="button primary" href="registro.html">Registrar negocio</a><a class="button secondary" href="index.html">Volver al inicio</a>');return;}
    if(!supabase){errorState('Conexión no disponible','No fue posible conectar con la plataforma.');return;}
    if(!slug&&!businessId){errorState('Perfil no indicado','Selecciona un negocio desde el directorio.','<a class="button primary" href="explorar.html">Explorar negocios</a>');return;}
    let q=supabase.from('negocios').select('*,categorias(nombre)').eq('activo',true);q=businessId?q.eq('id',businessId):q.eq('slug',slug);const {data:b,error}=await q.maybeSingle();
    if(error)throw error;if(!b){errorState('Perfil no disponible','El negocio no existe, está pausado o todavía no es público.','<a class="button primary" href="explorar.html">Explorar otros negocios</a>');return;}
    const [{data:promociones},{data:redes},{data:horarios},{data:galeria}]=await Promise.all([
      supabase.from('promociones').select('*').eq('negocio_id',b.id).eq('activa',true).order('destacada',{ascending:false}),
      supabase.from('redes_sociales').select('*').eq('negocio_id',b.id).eq('activa',true),
      supabase.from('horarios_negocio').select('*').eq('negocio_id',b.id).order('dia_semana'),
      supabase.from('galeria_negocio').select('*').eq('negocio_id',b.id).order('orden')
    ]);
    renderProfile({...b,categoria:b.categorias?.nombre||'Negocio aliado',promociones:promociones||[],redes:redes||[],horarios:horarios||[],galeria:galeria||[]});
  }catch(error){console.error(error);errorState('No fue posible cargar el perfil',error.message||'Inténtalo nuevamente más tarde.','<button class="button primary" onclick="location.reload()">Reintentar</button>');}
}
load();


reportButton.addEventListener('click',()=>{if(!currentProfile?.id)return;reportModal.classList.remove('hidden');});
document.querySelector('#report-close')?.addEventListener('click',()=>reportModal.classList.add('hidden'));
reportForm?.addEventListener('submit',async e=>{e.preventDefault();if(!currentProfile?.id)return;const payload={negocio_id:currentProfile.id,motivo:document.querySelector('#report-reason').value,correo_reportante:document.querySelector('#report-email').value.trim(),descripcion:document.querySelector('#report-description').value.trim()};const {error}=await supabase.from('reportes_negocio').insert(payload);if(error){showToast(error.message);return;}reportForm.reset();reportModal.classList.add('hidden');showToast('Reporte enviado. Administración lo revisará.');});
