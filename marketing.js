import { supabase } from './supabase-client.js?v=20260720-600';

const state={user:null,draft:null,business:null,data:{},profileUrl:'',calendarSeed:0,qrImageUrl:''};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function showMessage(text,type='success'){
  const box=$('#marketing-message'); box.textContent=text; box.className=`notice ${type==='error'?'danger':type==='warning'?'warning':'success'}`;
  setTimeout(()=>box.classList.add('hidden'),4500);
}
function slugify(value){return String(value||'recurso').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function getPromotion(){return (state.data.promociones||[])[0]||{};}
function normalizePhone(value){return String(value||'').replace(/\D/g,'');}
function profileLink(){
  const slug=state.business?.slug||state.data?.slug||state.draft?.slug||'';
  if(slug)return `${location.origin}/perfil.html?slug=${encodeURIComponent(slug)}`;
  if(state.draft?.negocio_id)return `${location.origin}/perfil.html?business_id=${encodeURIComponent(state.draft.negocio_id)}`;
  return '';
}

async function loadBusiness(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){location.href='login.html';return;}
  state.user=user;
  const {data:draft,error}=await supabase.from('perfiles_borrador').select('*').eq('usuario_id',user.id).maybeSingle();
  if(error) throw error;
  state.draft=draft||{}; state.data=draft?.datos||{};
  if(draft?.negocio_id){
    const {data:business,error:businessError}=await supabase.from('negocios').select('id,slug,nombre,logo_url,whatsapp,enlace_maps').eq('id',draft.negocio_id).maybeSingle();
    if(businessError) throw businessError;
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
  const canvas=$('#marketing-canvas');
  const ctx=canvas.getContext('2d');
  const format=$('#design-format').value;
  const dims={square:[1080,1080],story:[1080,1920],landscape:[1600,900]}[format];
  canvas.width=dims[0];canvas.height=dims[1];
  const w=canvas.width,h=canvas.height;
  const style=$('#design-style').value;
  const isLight=style==='light';
  const palette=isLight
    ?{text:'#11131a',muted:'#444b5c',card:'rgba(255,255,255,.9)',accent:'#7026a8'}
    :{text:'#ffffff',muted:'#d4d7df',card:'rgba(8,11,18,.78)',accent:'#d68cff'};

  const gradient=ctx.createLinearGradient(0,0,w,h);
  gradient.addColorStop(0,isLight?'#e9e6ff':'#07111f');
  gradient.addColorStop(.5,isLight?'#fff':'#111021');
  gradient.addColorStop(1,isLight?'#f6e9f4':'#200c25');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  if(style==='brand'){
    const glow=ctx.createRadialGradient(w*.12,h*.16,0,w*.12,h*.16,w*.65);glow.addColorStop(0,'rgba(0,71,255,.45)');glow.addColorStop(1,'rgba(0,71,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    const glow2=ctx.createRadialGradient(w*.85,h*.75,0,w*.85,h*.75,w*.65);glow2.addColorStop(0,'rgba(255,45,154,.42)');glow2.addColorStop(1,'rgba(255,45,154,0)');ctx.fillStyle=glow2;ctx.fillRect(0,0,w,h);
  }

  const logoUrl=state.data.logo_url||state.business?.logo_url;
  const coverUrl=state.data.portada_url;
  const [logo,cover]=await Promise.all([loadImage(logoUrl),loadImage(coverUrl)]);
  if(cover){ctx.save();ctx.globalAlpha=.2;drawImageCover(ctx,cover,0,0,w,h);ctx.restore();}

  const cfg={
    square:{pad:64,top:64,logo:190,logoGap:54,titleSize:68,titleLine:76,descSize:31,descLine:42,maxTitle:2,maxDesc:3,buttonH:72,buttonW:430,bottomSafe:155},
    story:{pad:78,top:120,logo:225,logoGap:92,titleSize:78,titleLine:88,descSize:37,descLine:50,maxTitle:3,maxDesc:5,buttonH:92,buttonW:600,bottomSafe:235},
    landscape:{pad:52,top:48,logo:150,logoGap:48,titleSize:58,titleLine:64,descSize:27,descLine:37,maxTitle:2,maxDesc:2,buttonH:64,buttonW:390,bottomSafe:118}
  }[format];

  const cardX=cfg.pad,cardY=cfg.top,cardW=w-cfg.pad*2,cardH=h-cfg.top-cfg.pad;
  ctx.fillStyle=palette.card;roundRect(ctx,cardX,cardY,cardW,cardH,format==='story'?46:34);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();

  const logoX=cardX+38,logoY=cardY+38;
  ctx.fillStyle='#fff';roundRect(ctx,logoX,logoY,cfg.logo,cfg.logo,cfg.logo*.2);ctx.fill();
  if(logo) drawImageContain(ctx,logo,logoX+16,logoY+16,cfg.logo-32,cfg.logo-32);
  else{ctx.fillStyle='#111';ctx.font=`900 ${cfg.logo*.22}px Arial`;ctx.textAlign='center';ctx.fillText((state.data.nombre||'AF').slice(0,2).toUpperCase(),logoX+cfg.logo/2,logoY+cfg.logo*.6);}

  let textX,textTop,textWidth;
  if(format==='landscape'){
    textX=logoX+cfg.logo+cfg.logoGap;
    textTop=cardY+70;
    textWidth=cardX+cardW-textX-44;
  }else{
    textX=logoX;
    textTop=logoY+cfg.logo+cfg.logoGap;
    textWidth=cardW-76;
  }

  ctx.textAlign='left';
  ctx.fillStyle=palette.accent;ctx.font=`800 ${format==='story'?34:26}px Arial`;
  ctx.fillText((state.data.categoria||'NEGOCIO LOCAL').toUpperCase(),textX,textTop);

  const title=$('#design-title').value||state.data.nombre||'Tu negocio';
  let y=textTop+(format==='story'?104:format==='landscape'?62:82);
  ctx.fillStyle=palette.text;ctx.font=`900 ${cfg.titleSize}px Arial`;
  const titleLines=wrapText(ctx,title,textWidth).slice(0,cfg.maxTitle);
  titleLines.forEach(line=>{ctx.fillText(line,textX,y);y+=cfg.titleLine;});

  y+=format==='landscape'?10:20;
  ctx.fillStyle=palette.muted;ctx.font=`400 ${cfg.descSize}px Arial`;
  const descLines=wrapText(ctx,$('#design-description').value,textWidth).slice(0,cfg.maxDesc);
  descLines.forEach(line=>{ctx.fillText(line,textX,y);y+=cfg.descLine;});

  const footerY=cardY+cardH-34;
  const btnY=footerY-cfg.bottomSafe;
  const btnW=Math.min(textWidth,cfg.buttonW);
  const btnX=format==='landscape'?textX:cardX+38;
  ctx.fillStyle=isLight?'#161923':'rgba(0,0,0,.58)';roundRect(ctx,btnX,btnY,btnW,cfg.buttonH,999);ctx.fill();
  ctx.strokeStyle='#c45cff';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#fff';ctx.font=`800 ${format==='story'?34:format==='landscape'?25:27}px Arial`;ctx.textAlign='center';
  const cta=$('#design-cta').value||'Conoce más';
  ctx.fillText(cta,btnX+btnW/2,btnY+cfg.buttonH*.64);

  const contact=[state.data.municipio,state.data.whatsapp?`WhatsApp: ${state.data.whatsapp}`:''].filter(Boolean).join('  •  ');
  ctx.fillStyle=isLight?'#50576a':'#bfc4d0';ctx.font=`600 ${format==='story'?25:format==='landscape'?18:20}px Arial`;ctx.textAlign='left';
  const contactLines=wrapText(ctx,contact,format==='landscape'?Math.min(620,textWidth):cardW-76).slice(0,2);
  let contactY=footerY-(contactLines.length-1)*(format==='story'?31:25);
  contactLines.forEach(line=>{ctx.fillText(line,cardX+38,contactY);contactY+=format==='story'?31:25;});

  ctx.fillStyle=isLight?'#1c2230':'rgba(255,255,255,.78)';ctx.font=`700 ${format==='story'?25:format==='landscape'?17:20}px Arial`;ctx.textAlign='right';
  ctx.fillText('ALIADOS FANTASMA',cardX+cardW-38,cardY+48);
  ctx.textAlign='left';
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

function setQrType(type){
  const phone=normalizePhone(state.data.whatsapp||state.business?.whatsapp);
  const urls={profile:state.profileUrl,whatsapp:phone?`https://wa.me/52${phone.replace(/^52/,'')}`:'',maps:state.data.maps||state.data.enlace_maps||state.business?.enlace_maps||'',custom:$('#qr-url').value};
  $('#qr-url').readOnly=type!=='custom';
  $('#qr-url').value=urls[type]||'';
  generateQr();
}
async function generateQr(){
  const url=$('#qr-url').value.trim();
  const preview=$('#marketing-qr');
  const download=$('#download-qr');
  if(!url){
    state.qrImageUrl='';
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    download.removeAttribute('href');
    download.classList.add('disabled');
    $('#qr-destination').textContent='No se encontró un enlace disponible. Completa el perfil o selecciona otro destino.';
    $('#qr-label').textContent=$('#qr-type').selectedOptions[0].textContent;
    await renderPrintableProfile();
    return;
  }
  const qr=`https://api.qrserver.com/v1/create-qr-code/?size=900x900&margin=24&format=png&data=${encodeURIComponent(url)}`;
  state.qrImageUrl=qr;
  preview.crossOrigin='anonymous';
  preview.onload=()=>preview.classList.remove('hidden');
  preview.onerror=()=>{preview.classList.add('hidden');showMessage('No se pudo cargar la vista previa del QR. Intenta actualizar el cartel.','warning');};
  preview.src=qr;
  $('#qr-destination').textContent=url;
  download.href=qr;
  download.classList.remove('disabled');
  $('#qr-label').textContent=$('#qr-type').selectedOptions[0].textContent;
  await renderPrintableProfile();
}

function drawImageCover(ctx,img,x,y,w,h){
  const scale=Math.max(w/img.width,h/img.height);
  const dw=img.width*scale,dh=img.height*scale;
  ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function drawImageContain(ctx,img,x,y,w,h){
  const scale=Math.min(w/img.width,h/img.height);
  const dw=img.width*scale,dh=img.height*scale;
  ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
async function renderPrintableProfile(){
  const canvas=$('#profile-poster-canvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const w=1240,h=1754;canvas.width=w;canvas.height=h;
  const template=$('#poster-style')?.value||'commercial';
  const name=state.data.nombre||state.business?.nombre||'Tu negocio';
  const category=state.data.categoria||'Negocio local';
  const description=state.data.descripcion_corta||state.data.descripcion||'Conoce nuestra información, promociones y formas de contacto.';
  const municipality=state.data.municipio||state.data.alcaldia||'';
  const phone=state.data.whatsapp||state.business?.whatsapp||'';
  const promotion=getPromotion();
  const logoUrl=state.data.logo_url||state.business?.logo_url||'aliados-fantasma-icono.webp';
  const coverUrl=state.data.portada_url||logoUrl;
  const [logo,cover,qr]=await Promise.all([loadImage(logoUrl),loadImage(coverUrl),loadImage(state.qrImageUrl)]);

  const colors={bg:'#070a10',panel:'#10141d',text:'#ffffff',muted:'#c8ccd6',accent:'#c56dff',blue:'#3478ff',pink:'#ff3a9f'};
  ctx.clearRect(0,0,w,h);ctx.fillStyle=colors.bg;ctx.fillRect(0,0,w,h);ctx.textAlign='center';

  const drawLogo=(x,y,size)=>{
    ctx.save();ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=25;ctx.fillStyle='#fff';roundRect(ctx,x,y,size,size,Math.round(size*.2));ctx.fill();ctx.restore();
    if(logo)drawImageContain(ctx,logo,x+Math.round(size*.08),y+Math.round(size*.08),size-Math.round(size*.16),size-Math.round(size*.16));
    else{ctx.fillStyle='#111';ctx.font=`900 ${Math.round(size*.24)}px Arial`;ctx.fillText(name.slice(0,2).toUpperCase(),x+size/2,y+size*.62);}
  };
  const drawQr=(x,y,size)=>{
    ctx.save();ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=25;ctx.fillStyle='#fff';roundRect(ctx,x,y,size,size,34);ctx.fill();ctx.restore();
    if(qr)drawImageContain(ctx,qr,x+28,y+28,size-56,size-56);
    else{ctx.fillStyle='#111';ctx.font='800 26px Arial';wrapText(ctx,'Genera el QR para completar el cartel',size-80).slice(0,3).forEach((line,i)=>ctx.fillText(line,x+size/2,y+size/2+i*34));}
  };
  const drawWrapped=(text,x,y,maxWidth,font,lineHeight,maxLines,color)=>{
    ctx.font=font;ctx.fillStyle=color;const lines=wrapText(ctx,text,maxWidth).slice(0,maxLines);lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));return y+lines.length*lineHeight;
  };
  const contact=[];
  if($('#poster-show-phone')?.checked&&phone)contact.push(`WhatsApp: ${phone}`);
  if($('#poster-show-location')?.checked&&municipality)contact.push(municipality);
  const posterTitle=$('#poster-title')?.value||'Conoce nuestro perfil digital';
  const cta=$('#poster-cta')?.value||'Escanea el código QR para conocer nuestro perfil';

  if(template==='minimal'){
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#07111f');g.addColorStop(.55,'#10121e');g.addColorStop(1,'#1d0b22');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(255,255,255,.035)';roundRect(ctx,74,74,w-148,h-148,44);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();
    drawLogo((w-230)/2,145,230);
    let y=450;y=drawWrapped(name,w/2,y,1000,'900 62px Arial',70,2,colors.text)+8;
    y=drawWrapped(category.toUpperCase(),w/2,y,950,'800 27px Arial',34,2,colors.accent)+55;
    drawQr((w-560)/2,y,560);y+=625;
    ctx.font='900 38px Arial';ctx.fillStyle=colors.text;ctx.fillText('ESCANEA AQUÍ',w/2,y);y+=58;
    drawWrapped(cta,w/2,y,920,'400 25px Arial',34,3,colors.muted);
    ctx.strokeStyle='rgba(255,255,255,.1)';ctx.beginPath();ctx.moveTo(150,h-178);ctx.lineTo(w-150,h-178);ctx.stroke();
    ctx.font='700 22px Arial';ctx.fillStyle='#dde1eb';ctx.fillText(contact.join('   •   ')||'Perfil digital en Aliados Fantasma',w/2,h-125);
    ctx.font='700 18px Arial';ctx.fillStyle='#949baa';ctx.fillText('ALIADOS FANTASMA',w/2,h-82);
  }else if(template==='promotion'){
    if(cover){ctx.save();ctx.globalAlpha=.34;drawImageCover(ctx,cover,0,0,w,h);ctx.restore();}
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(3,7,16,.42)');g.addColorStop(.42,'rgba(7,10,16,.92)');g.addColorStop(1,'#070a10');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(8,12,21,.86)';roundRect(ctx,62,62,w-124,h-124,44);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.13)';ctx.lineWidth=2;ctx.stroke();
    drawLogo(105,105,190);
    ctx.textAlign='left';ctx.fillStyle=colors.accent;ctx.font='800 26px Arial';ctx.fillText(category.toUpperCase(),335,145);
    drawWrapped(name,335,205,790,'900 54px Arial',60,2,colors.text);
    ctx.textAlign='center';
    const promoTitle=promotion.titulo||posterTitle||'Promoción especial';
    let y=430;y=drawWrapped(promoTitle,w/2,y,1010,'900 67px Arial',76,3,'#ffffff')+20;
    const promoDesc=promotion.descripcion||description;
    y=drawWrapped(promoDesc,w/2,y,970,'400 29px Arial',40,4,colors.muted)+50;
    drawQr((w-500)/2,y,500);y+=565;
    ctx.font='900 36px Arial';ctx.fillStyle=colors.text;ctx.fillText('ESCANEA Y CONOCE MÁS',w/2,y);y+=50;
    drawWrapped(cta,w/2,y,930,'400 24px Arial',33,3,colors.muted);
    ctx.fillStyle='rgba(255,255,255,.06)';roundRect(ctx,120,h-190,w-240,82,41);ctx.fill();ctx.font='700 22px Arial';ctx.fillStyle='#eef1f7';ctx.fillText(contact.join('   •   ')||'Consulta el perfil digital',w/2,h-139);
    ctx.font='700 18px Arial';ctx.fillStyle='#a4abb8';ctx.fillText('Perfil creado en Aliados Fantasma',w/2,h-74);
  }else{
    const heroH=510;
    if(cover){ctx.save();if(!state.data.portada_url){ctx.filter='blur(20px)';ctx.globalAlpha=.9;drawImageCover(ctx,cover,-25,-25,w+50,heroH+50);}else drawImageCover(ctx,cover,0,0,w,heroH);ctx.restore();}
    else{const g=ctx.createLinearGradient(0,0,w,heroH);g.addColorStop(0,colors.blue);g.addColorStop(1,colors.pink);ctx.fillStyle=g;ctx.fillRect(0,0,w,heroH);}
    const ov=ctx.createLinearGradient(0,0,0,heroH);ov.addColorStop(0,'rgba(4,8,16,.15)');ov.addColorStop(.55,'rgba(4,8,16,.55)');ov.addColorStop(1,'#070a10');ctx.fillStyle=ov;ctx.fillRect(0,0,w,heroH);
    drawLogo((w-220)/2,105,220);
    let y=390;y=drawWrapped(name,w/2,y,1050,'900 57px Arial',64,2,colors.text)+6;
    drawWrapped(category.toUpperCase(),w/2,y,950,'800 27px Arial',34,2,colors.accent);
    ctx.fillStyle=colors.panel;roundRect(ctx,72,525,w-144,h-610,42);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();
    y=630;y=drawWrapped(posterTitle,w/2,y,980,'900 43px Arial',52,2,colors.text)+14;
    y=drawWrapped(description,w/2,y,910,'400 25px Arial',34,3,colors.muted)+36;
    drawQr((w-500)/2,y,500);y+=570;
    ctx.font='900 35px Arial';ctx.fillStyle=colors.text;ctx.fillText('ESCANEA AQUÍ',w/2,y);y+=49;
    drawWrapped(cta,w/2,y,900,'400 24px Arial',32,3,colors.muted);
    const footerY=h-205;
    ctx.fillStyle='rgba(255,255,255,.06)';roundRect(ctx,125,footerY,w-250,82,41);ctx.fill();ctx.font='700 22px Arial';ctx.fillStyle='#edf0f7';ctx.fillText(contact.join('   •   ')||'Consulta promociones, contacto y ubicación',w/2,footerY+51);
    ctx.font='700 18px Arial';ctx.fillStyle='#a1a8b5';ctx.fillText('Perfil digital creado en Aliados Fantasma',w/2,h-75);
  }
  ctx.textAlign='left';
}
function downloadPosterPng(){
  const canvas=$('#profile-poster-canvas');
  const link=document.createElement('a');
  link.download=`perfil-imprimible-${slugify(state.data.nombre||state.business?.nombre)}.png`;
  link.href=canvas.toDataURL('image/png');link.click();
}
async function downloadPosterPdf(){
  try{
    await renderPrintableProfile();
    if(!window.jspdf?.jsPDF)throw new Error('No se pudo cargar el generador de PDF.');
    const canvas=$('#profile-poster-canvas');
    const image=canvas.toDataURL('image/jpeg',.96);
    const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    pdf.addImage(image,'JPEG',0,0,210,297,undefined,'FAST');
    pdf.save(`perfil-imprimible-${slugify(state.data.nombre||state.business?.nombre)}.pdf`);
    showMessage('PDF generado correctamente.');
  }catch(error){console.error(error);showMessage(`No se pudo generar el PDF: ${error.message}`,'error');}
}

function renderCalendar(){const name=state.data.nombre||'tu negocio';const promo=getPromotion();const plans=[
  ['Lunes','Historia','Presenta el negocio',`Cuenta qué hace diferente a ${name}.`],['Martes','Publicación','Producto o servicio destacado','Muestra un beneficio concreto y agrega una llamada a WhatsApp.'],['Miércoles','Historia interactiva','Pregunta a tu comunidad','Usa una encuesta o pregunta relacionada con tus productos.'],['Jueves','Promoción',promo.titulo||'Oferta de la semana',promo.descripcion||'Crea una razón clara para comprar o visitar esta semana.'],['Viernes','Reel o video','Detrás de cámaras','Muestra cómo trabajas, preparas o atiendes.'],['Sábado','Historia','Disponibilidad y ubicación','Recuerda horarios, ubicación y formas de contacto.'],['Domingo','Publicación','Comunidad local','Agradece a clientes y recomienda apoyar negocios cercanos.']
  ]; const shift=state.calendarSeed%plans.length;const rotated=[...plans.slice(shift),...plans.slice(0,shift)];$('#marketing-calendar').innerHTML=rotated.map(([day,type,title,desc])=>`<article class="calendar-card"><span>${esc(day)} · ${esc(type)}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p><small>Objetivo: mantener presencia y generar interacción</small></article>`).join('');}
function resourceCard(icon,title,description,url,label='Abrir recurso'){return `<article class="resource-card"><div class="resource-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${url?`<a class="button secondary full" href="${esc(url)}" ${url.startsWith('http')?'target="_blank" rel="noopener"':''}>${esc(label)}</a>`:'<button class="button secondary full" disabled>No disponible</button>'}</article>`;}
function renderBrandResources(){const logo=state.data.logo_url||state.business?.logo_url;const cover=state.data.portada_url;const wa=normalizePhone(state.data.whatsapp);const resources=[resourceCard('🖼️','Logo del negocio','Archivo principal utilizado en tu perfil y diseños.',logo,'Abrir logo'),resourceCard('🌄','Portada','Imagen panorámica de tu perfil público.',cover,'Abrir portada'),resourceCard('▦','QR del perfil','Código que dirige a clientes a tu perfil digital.',state.profileUrl?`https://api.qrserver.com/v1/create-qr-code/?size=700x700&data=${encodeURIComponent(state.profileUrl)}`:'','Abrir QR'),resourceCard('💬','Enlace de WhatsApp','Acceso directo para recibir mensajes.',wa?`https://wa.me/52${wa.replace(/^52/,'')}`:'','Abrir WhatsApp'),resourceCard('📍','Ubicación','Enlace de Google Maps registrado.',state.data.maps||state.data.enlace_maps||state.business?.enlace_maps||'','Abrir mapa'),resourceCard('🌐','Perfil público','Consulta cómo ven tu negocio los clientes.',state.profileUrl,'Ver perfil')];$('#brand-resources').innerHTML=resources.join('');}

function bind(){
  document.querySelectorAll('.marketing-nav button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.marketing-nav button').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.marketing-section').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===btn.dataset.section));});
  ['design-format','design-type','design-style'].forEach(id=>document.getElementById(id).addEventListener('change',renderCanvas));['design-title','design-description','design-cta'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{clearTimeout(window.__designTimer);window.__designTimer=setTimeout(renderCanvas,180);}));
  $('#generate-design').onclick=renderCanvas;$('#download-design').onclick=downloadCanvas;$('#generate-copy').onclick=generateCopy;document.querySelectorAll('[data-copy-target]').forEach(btn=>btn.onclick=()=>copyField(btn.dataset.copyTarget));
  $('#qr-type').onchange=e=>setQrType(e.target.value);
  $('#generate-qr').onclick=generateQr;
  $('#qr-url').addEventListener('input',()=>{if($('#qr-type').value==='custom'){clearTimeout(window.__qrTimer);window.__qrTimer=setTimeout(generateQr,250);}});
  ['poster-title','poster-cta'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{clearTimeout(window.__posterTimer);window.__posterTimer=setTimeout(renderPrintableProfile,180);}));
  ['poster-style','poster-show-phone','poster-show-location'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderPrintableProfile));
  $('#download-poster-pdf').onclick=downloadPosterPdf;
  $('#download-poster-png').onclick=async()=>{await renderPrintableProfile();downloadPosterPng();};
  $('#regenerate-calendar').onclick=()=>{state.calendarSeed++;renderCalendar();};
}

bind();loadBusiness().catch(error=>{console.error(error);showMessage(`No fue posible cargar el Centro de Marketing: ${error.message}`,'error');});
