import { supabase } from './supabase-client.js?v=20260720-600';

const state={user:null,draft:null,business:null,data:{},profileUrl:'',calendarSeed:0};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function showMessage(text,type='success'){
  const box=$('#marketing-message'); box.textContent=text; box.className=`notice ${type==='error'?'danger':type==='warning'?'warning':'success'}`;
  setTimeout(()=>box.classList.add('hidden'),4500);
}
function slugify(value){return String(value||'recurso').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function getPromotion(){return (state.data.promociones||[])[0]||{};}
function normalizePhone(value){return String(value||'').replace(/\D/g,'');}
function profileLink(){return state.business?.slug?`${location.origin}/perfil.html?slug=${encodeURIComponent(state.business.slug)}`:'';}

async function loadBusiness(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){location.href='login.html';return;}
  state.user=user;
  const {data:draft,error}=await supabase.from('perfiles_borrador').select('*').eq('usuario_id',user.id).maybeSingle();
  if(error) throw error;
  state.draft=draft||{}; state.data=draft?.datos||{};
  if(draft?.negocio_id){
    const {data:business}=await supabase.from('negocios').select('id,slug,nombre,logo_url,whatsapp,maps_url').eq('id',draft.negocio_id).maybeSingle();
    state.business=business||null;
  }
  state.profileUrl=profileLink();
  const name=state.data.nombre||state.business?.nombre||'Tu negocio';
  $('#marketing-title').textContent=`Marketing para ${name}`;
  $('#marketing-subtitle').textContent='Crea recursos personalizados sin salir de Aliados Fantasma.';
  $('#business-chip-name').textContent=name;
  const logo=state.data.logo_url||state.business?.logo_url||'aliados-fantasma-icono.webp';
  $('#business-chip-logo').src=logo;
  $('#business-chip-logo').onerror=()=>{$('#business-chip-logo').src='aliados-fantasma-icono.webp';};
  fillDefaults(); renderCanvas(); generateCopy(); setQrType('profile'); renderCalendar(); renderBrandResources();
}

function fillDefaults(){
  const promo=getPromotion();
  $('#design-title').value=promo.titulo||state.data.descripcion_corta||`Conoce ${state.data.nombre||'nuestro negocio'}`;
  $('#design-description').value=promo.descripcion||state.data.descripcion||'Descubre nuestros productos, servicios y promociones.';
  $('#copy-topic').value=promo.titulo?`${promo.titulo}. ${promo.descripcion||''}`:state.data.descripcion_corta||'';
}

function wrapText(ctx,text,maxWidth){
  const words=String(text||'').split(/\s+/); const lines=[]; let line='';
  for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;}else line=test;}
  if(line)lines.push(line); return lines;
}
function roundRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.roundRect(x,y,w,h,rr);}
function loadImage(url){return new Promise(resolve=>{if(!url)return resolve(null);const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=url;});}

async function renderCanvas(){
  const canvas=$('#marketing-canvas'); const ctx=canvas.getContext('2d'); const format=$('#design-format').value;
  const dims={square:[1080,1080],story:[1080,1920],landscape:[1600,900]}[format]; canvas.width=dims[0];canvas.height=dims[1];
  const w=canvas.width,h=canvas.height; const style=$('#design-style').value;
  const palette=style==='light'?{bg:'#f4f4f8',text:'#11131a,',muted:'#444b5c',card:'rgba(255,255,255,.86)'}:style==='dark'?{bg:'#090b11',text:'#ffffff',muted:'#c6cad5',card:'rgba(13,16,24,.82)'}:{bg:'#070a10',text:'#ffffff',muted:'#d0d5e0',card:'rgba(8,11,18,.75)'};
  const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,style==='light'?'#e9e6ff':'#07111f');gradient.addColorStop(.5,style==='light'?'#fff':'#111021');gradient.addColorStop(1,style==='light'?'#f6e9f4':'#200c25');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  if(style==='brand'){
    const glow=ctx.createRadialGradient(w*.12,h*.16,0,w*.12,h*.16,w*.65);glow.addColorStop(0,'rgba(0,71,255,.45)');glow.addColorStop(1,'rgba(0,71,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    const glow2=ctx.createRadialGradient(w*.85,h*.75,0,w*.85,h*.75,w*.65);glow2.addColorStop(0,'rgba(255,45,154,.42)');glow2.addColorStop(1,'rgba(255,45,154,0)');ctx.fillStyle=glow2;ctx.fillRect(0,0,w,h);
  }
  const logoUrl=state.data.logo_url||state.business?.logo_url; const coverUrl=state.data.portada_url; const [logo,cover]=await Promise.all([loadImage(logoUrl),loadImage(coverUrl)]);
  if(cover){ctx.save();ctx.globalAlpha=.22;const scale=Math.max(w/cover.width,h/cover.height);ctx.drawImage(cover,(w-cover.width*scale)/2,(h-cover.height*scale)/2,cover.width*scale,cover.height*scale);ctx.restore();}
  const pad=format==='story'?78:64; const top=format==='story'?120:65;
  ctx.fillStyle=palette.card;roundRect(ctx,pad,top,w-pad*2,h-top-pad,format==='story'?46:34);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();
  const logoSize=format==='story'?230:format==='landscape'?180:200; const logoX=pad+45,logoY=top+45;
  ctx.fillStyle='#fff';roundRect(ctx,logoX,logoY,logoSize,logoSize,logoSize*.2);ctx.fill();
  if(logo){const scale=Math.min((logoSize*.82)/logo.width,(logoSize*.82)/logo.height);ctx.drawImage(logo,logoX+(logoSize-logo.width*scale)/2,logoY+(logoSize-logo.height*scale)/2,logo.width*scale,logo.height*scale);}else{ctx.fillStyle='#111';ctx.font=`900 ${logoSize*.22}px Arial`;ctx.textAlign='center';ctx.fillText((state.data.nombre||'AF').slice(0,2).toUpperCase(),logoX+logoSize/2,logoY+logoSize*.6);ctx.textAlign='left';}
  const textStartY=format==='story'?logoY+logoSize+105:format==='landscape'?top+115:logoY+logoSize+65;
  const textX=format==='landscape'?logoX+logoSize+65:logoX; const textWidth=format==='landscape'?w-textX-pad-55:w-pad*2-90;
  ctx.fillStyle=style==='light'?'#7026a8':'#d68cff';ctx.font=`800 ${format==='story'?34:28}px Arial`;ctx.fillText((state.data.categoria||'NEGOCIO LOCAL').toUpperCase(),textX,textStartY);
  const title=$('#design-title').value||state.data.nombre||'Tu negocio';ctx.fillStyle=style==='light'?'#10131b':'#fff';ctx.font=`900 ${format==='story'?78:format==='landscape'?64:70}px Arial`;let y=textStartY+(format==='story'?105:85);const titleLines=wrapText(ctx,title,textWidth);titleLines.slice(0,3).forEach(line=>{ctx.fillText(line,textX,y);y+=format==='story'?88:76;});
  ctx.fillStyle=style==='light'?'#3c4352':'#d4d7df';ctx.font=`400 ${format==='story'?37:format==='landscape'?30:32}px Arial`;y+=25;const descLines=wrapText(ctx,$('#design-description').value,textWidth);descLines.slice(0,format==='story'?5:3).forEach(line=>{ctx.fillText(line,textX,y);y+=format==='story'?50:42;});
  const cta=$('#design-cta').value||'Conoce más';const btnY=h-pad-(format==='story'?185:105);ctx.fillStyle=style==='light'?'#161923':'rgba(0,0,0,.55)';roundRect(ctx,textX,btnY,Math.min(textWidth,format==='story'?600:430),format==='story'?92:72,999);ctx.fill();ctx.strokeStyle='#c45cff';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#fff';ctx.font=`800 ${format==='story'?34:27}px Arial`;ctx.textAlign='center';ctx.fillText(cta,textX+Math.min(textWidth,format==='story'?600:430)/2,btnY+(format==='story'?58:46));ctx.textAlign='left';
  ctx.fillStyle=style==='light'?'#50576a':'#bfc4d0';ctx.font=`600 ${format==='story'?27:22}px Arial`;const contact=[state.data.municipio,state.data.whatsapp?`WhatsApp: ${state.data.whatsapp}`:''].filter(Boolean).join('  •  ');ctx.fillText(contact,textX,h-pad-28);
  ctx.fillStyle=style==='light'?'#1c2230':'rgba(255,255,255,.78)';ctx.font=`700 ${format==='story'?25:20}px Arial`;ctx.textAlign='right';ctx.fillText('ALIADOS FANTASMA',w-pad-45,top+68);ctx.textAlign='left';
}

function downloadCanvas(){const canvas=$('#marketing-canvas');const link=document.createElement('a');link.download=`${slugify(state.data.nombre)}-${$('#design-format').value}.png`;link.href=canvas.toDataURL('image/png');link.click();}
function generateCopy(){
  const name=state.data.nombre||'nuestro negocio'; const category=state.data.categoria||'negocio local'; const topic=$('#copy-topic').value.trim()||state.data.descripcion_corta||'tenemos algo especial para ti'; const goal=$('#copy-goal').value;const tone=$('#copy-tone').value;
  const openings={friendly:`✨ ¡Hola! En ${name} queremos compartirte algo especial.`,professional:`En ${name}, nos enfocamos en ofrecerte una experiencia de calidad.`,energetic:`🔥 ¡Atención! ${name} tiene algo que no te puedes perder.`,premium:`Descubre una experiencia creada con detalle en ${name}.`};
  const closings={sell:'Escríbenos para conocer disponibilidad, precios y opciones.',visit:'Visítanos y conoce todo lo que tenemos preparado para ti.',announce:'Guarda esta información y compártela con quien pueda necesitarla.',community:'Apoyar negocios locales también fortalece nuestra comunidad.'};
  const location=state.data.municipio?`📍 ${state.data.municipio}`:'';const wa=state.data.whatsapp?`📲 WhatsApp: ${state.data.whatsapp}`:'';
  $('#generated-post').value=`${openings[tone]}\n\n${topic}\n\n${closings[goal]}\n\n${[location,wa].filter(Boolean).join('\n')}`;
  $('#generated-story').value=`${goal==='sell'?'🔥':'✨'} ${topic}\n\n${name}\n${wa||'Conoce nuestro perfil en Aliados Fantasma'}`;
  const tags=[name,category,state.data.municipio,'NegocioLocal','AliadosFantasma','CompraLocal'].filter(Boolean).map(v=>`#${String(v).replace(/[^a-zA-Z0-9ÁÉÍÓÚáéíóúÑñ]/g,'')}`);$('#generated-hashtags').value=[...new Set(tags)].join(' ');
}
async function copyField(id){const input=document.getElementById(id);await navigator.clipboard.writeText(input.value);showMessage('Contenido copiado.');}

function setQrType(type){const phone=normalizePhone(state.data.whatsapp||state.business?.whatsapp);const urls={profile:state.profileUrl,whatsapp:phone?`https://wa.me/52${phone.replace(/^52/,'')}`:'',maps:state.data.maps||state.business?.maps_url||'',custom:$('#qr-url').value};$('#qr-url').readOnly=type!=='custom';$('#qr-url').value=urls[type]||'';generateQr();}
function generateQr(){const url=$('#qr-url').value.trim();if(!url){$('#marketing-qr').removeAttribute('src');$('#qr-destination').textContent='Completa este enlace en tu perfil.';return;}const qr=`https://api.qrserver.com/v1/create-qr-code/?size=700x700&margin=20&data=${encodeURIComponent(url)}`;$('#marketing-qr').src=qr;$('#qr-destination').textContent=url;$('#download-qr').href=qr;$('#qr-label').textContent=$('#qr-type').selectedOptions[0].textContent;}

function renderCalendar(){const name=state.data.nombre||'tu negocio';const promo=getPromotion();const plans=[
  ['Lunes','Historia','Presenta el negocio',`Cuenta qué hace diferente a ${name}.`],['Martes','Publicación','Producto o servicio destacado','Muestra un beneficio concreto y agrega una llamada a WhatsApp.'],['Miércoles','Historia interactiva','Pregunta a tu comunidad','Usa una encuesta o pregunta relacionada con tus productos.'],['Jueves','Promoción',promo.titulo||'Oferta de la semana',promo.descripcion||'Crea una razón clara para comprar o visitar esta semana.'],['Viernes','Reel o video','Detrás de cámaras','Muestra cómo trabajas, preparas o atiendes.'],['Sábado','Historia','Disponibilidad y ubicación','Recuerda horarios, ubicación y formas de contacto.'],['Domingo','Publicación','Comunidad local','Agradece a clientes y recomienda apoyar negocios cercanos.']
  ]; const shift=state.calendarSeed%plans.length;const rotated=[...plans.slice(shift),...plans.slice(0,shift)];$('#marketing-calendar').innerHTML=rotated.map(([day,type,title,desc])=>`<article class="calendar-card"><span>${esc(day)} · ${esc(type)}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p><small>Objetivo: mantener presencia y generar interacción</small></article>`).join('');}
function resourceCard(icon,title,description,url,label='Abrir recurso'){return `<article class="resource-card"><div class="resource-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${url?`<a class="button secondary full" href="${esc(url)}" ${url.startsWith('http')?'target="_blank" rel="noopener"':''}>${esc(label)}</a>`:'<button class="button secondary full" disabled>No disponible</button>'}</article>`;}
function renderBrandResources(){const logo=state.data.logo_url||state.business?.logo_url;const cover=state.data.portada_url;const wa=normalizePhone(state.data.whatsapp);const resources=[resourceCard('🖼️','Logo del negocio','Archivo principal utilizado en tu perfil y diseños.',logo,'Abrir logo'),resourceCard('🌄','Portada','Imagen panorámica de tu perfil público.',cover,'Abrir portada'),resourceCard('▦','QR del perfil','Código que dirige a clientes a tu perfil digital.',state.profileUrl?`https://api.qrserver.com/v1/create-qr-code/?size=700x700&data=${encodeURIComponent(state.profileUrl)}`:'','Abrir QR'),resourceCard('💬','Enlace de WhatsApp','Acceso directo para recibir mensajes.',wa?`https://wa.me/52${wa.replace(/^52/,'')}`:'','Abrir WhatsApp'),resourceCard('📍','Ubicación','Enlace de Google Maps registrado.',state.data.maps||'','Abrir mapa'),resourceCard('🌐','Perfil público','Consulta cómo ven tu negocio los clientes.',state.profileUrl,'Ver perfil')];$('#brand-resources').innerHTML=resources.join('');}

function bind(){
  document.querySelectorAll('.marketing-nav button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.marketing-nav button').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.marketing-section').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===btn.dataset.section));});
  ['design-format','design-type','design-style'].forEach(id=>document.getElementById(id).addEventListener('change',renderCanvas));['design-title','design-description','design-cta'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{clearTimeout(window.__designTimer);window.__designTimer=setTimeout(renderCanvas,180);}));
  $('#generate-design').onclick=renderCanvas;$('#download-design').onclick=downloadCanvas;$('#generate-copy').onclick=generateCopy;document.querySelectorAll('[data-copy-target]').forEach(btn=>btn.onclick=()=>copyField(btn.dataset.copyTarget));
  $('#qr-type').onchange=e=>setQrType(e.target.value);$('#generate-qr').onclick=generateQr;$('#regenerate-calendar').onclick=()=>{state.calendarSeed++;renderCalendar();};
}

bind();loadBusiness().catch(error=>{console.error(error);showMessage(`No fue posible cargar el Centro de Marketing: ${error.message}`,'error');});
