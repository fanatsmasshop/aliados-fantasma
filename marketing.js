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
  const format=$('#poster-format')?.value||'a4';
  const formats={
    a4:{w:1240,h:1754,label:'cartel-a4',pdf:{orientation:'portrait',format:'a4'}},
    a5:{w:874,h:1240,label:'cartel-a5',pdf:{orientation:'portrait',format:'a5'}},
    counter:{w:1600,h:1000,label:'mostrador',pdf:{orientation:'landscape',format:'a5'}},
    table:{w:1000,h:1400,label:'display-mesa',pdf:{orientation:'portrait',format:[148,210]}},
    window:{w:1400,h:2000,label:'escaparate',pdf:{orientation:'portrait',format:'a3'}},
    card:{w:1050,h:600,label:'tarjeta',pdf:{orientation:'landscape',format:[90,51]}},
    label:{w:800,h:800,label:'etiqueta-qr',pdf:{orientation:'portrait',format:[80,80]}}
  };
  const cfg=formats[format];
  const ctx=canvas.getContext('2d');
  const w=cfg.w,h=cfg.h;canvas.width=w;canvas.height=h;canvas.style.aspectRatio=`${w}/${h}`;
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
  const posterTitle=$('#poster-title')?.value||'Conoce nuestro perfil digital';
  const cta=$('#poster-cta')?.value||'Escanea el código QR para conocer información, promociones y contacto';
  const contact=[];
  if($('#poster-show-phone')?.checked&&phone)contact.push(`WhatsApp: ${phone}`);
  if($('#poster-show-location')?.checked&&municipality)contact.push(municipality);
  const colors={bg:'#070a10',panel:'#10141d',text:'#ffffff',muted:'#c8ccd6',accent:'#c56dff',blue:'#3478ff',pink:'#ff3a9f'};
  const scale=Math.min(w/1240,h/1754);
  const S=n=>Math.max(1,Math.round(n*scale));
  ctx.clearRect(0,0,w,h);ctx.textAlign='center';ctx.textBaseline='alphabetic';

  const drawWrapped=(text,x,y,maxWidth,font,lineHeight,maxLines,color)=>{
    ctx.font=font;ctx.fillStyle=color;const lines=wrapText(ctx,text,maxWidth).slice(0,maxLines);
    lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));return y+lines.length*lineHeight;
  };
  const drawLogo=(x,y,size)=>{
    ctx.save();ctx.shadowColor='rgba(0,0,0,.3)';ctx.shadowBlur=S(22);ctx.fillStyle='#fff';roundRect(ctx,x,y,size,size,S(30));ctx.fill();ctx.restore();
    if(logo)drawImageContain(ctx,logo,x+size*.08,y+size*.08,size*.84,size*.84);
    else{ctx.fillStyle='#111';ctx.font=`900 ${Math.round(size*.24)}px Arial`;ctx.fillText(name.slice(0,2).toUpperCase(),x+size/2,y+size*.62);}
  };
  const drawQr=(x,y,size)=>{
    ctx.save();ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=S(22);ctx.fillStyle='#fff';roundRect(ctx,x,y,size,size,S(28));ctx.fill();ctx.restore();
    if(qr)drawImageContain(ctx,qr,x+size*.07,y+size*.07,size*.86,size*.86);
    else{ctx.fillStyle='#111';ctx.font=`800 ${S(24)}px Arial`;wrapText(ctx,'Genera el QR para completar el material',size*.75).slice(0,3).forEach((line,i)=>ctx.fillText(line,x+size/2,y+size*.48+i*S(30)));}
  };
  const drawFooter=(y,compact=false)=>{
    const footerH=compact?S(72):S(104);const x=S(70),fw=w-S(140);
    ctx.fillStyle='rgba(255,255,255,.07)';roundRect(ctx,x,y,fw,footerH,footerH/2);ctx.fill();
    ctx.fillStyle='#eef1f7';ctx.font=`700 ${compact?S(16):S(21)}px Arial`;
    const text=contact.join('   •   ')||'Perfil digital en Aliados Fantasma';
    ctx.fillText(text,w/2,y+footerH*.62);
  };
  const drawBrandBackground=()=>{
    if(cover){ctx.save();ctx.globalAlpha=template==='minimal'?.16:.28;drawImageCover(ctx,cover,0,0,w,h);ctx.restore();}
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(3,13,30,.94)');g.addColorStop(.55,'rgba(10,12,23,.94)');g.addColorStop(1,'rgba(35,7,34,.96)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    if(template==='minimal'){ctx.fillStyle='rgba(7,10,16,.72)';ctx.fillRect(0,0,w,h);}
  };
  drawBrandBackground();

  if(format==='card'){
    const pad=S(50),logoSize=S(150),qrSize=S(280);
    ctx.fillStyle='rgba(10,14,24,.88)';roundRect(ctx,pad,pad,w-pad*2,h-pad*2,S(32));ctx.fill();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=S(2);ctx.stroke();
    drawLogo(pad+S(35),pad+S(35),logoSize);
    ctx.textAlign='left';ctx.fillStyle=colors.accent;ctx.font=`800 ${S(24)}px Arial`;ctx.fillText(category.toUpperCase(),pad+S(220),pad+S(80));
    let y=pad+S(145);y=drawWrapped(name,pad+S(220),y,w-qrSize-pad*3-S(220),`900 ${S(44)}px Arial`,S(50),2,colors.text)+S(18);
    drawWrapped(posterTitle,pad+S(220),y,w-qrSize-pad*3-S(220),`600 ${S(24)}px Arial`,S(31),2,colors.muted);
    ctx.textAlign='center';drawQr(w-pad-qrSize,pad+S(45),qrSize);
    ctx.font=`900 ${S(22)}px Arial`;ctx.fillStyle=colors.text;ctx.fillText('ESCANEA Y CONOCE MÁS',w-pad-qrSize/2,pad+S(365));
    ctx.textAlign='left';ctx.font=`700 ${S(18)}px Arial`;ctx.fillStyle='#dfe3ec';ctx.fillText(contact.join('  •  ')||'Aliados Fantasma',pad+S(35),h-pad-S(24));
  }else if(format==='label'){
    const pad=S(55),qrSize=S(390);ctx.fillStyle='rgba(10,14,24,.9)';roundRect(ctx,pad,pad,w-pad*2,h-pad*2,S(36));ctx.fill();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=S(2);ctx.stroke();
    drawLogo((w-S(130))/2,pad+S(35),S(130));
    let y=pad+S(205);y=drawWrapped(name,w/2,y,w-S(130),`900 ${S(38)}px Arial`,S(44),2,colors.text)+S(16);
    drawQr((w-qrSize)/2,y,qrSize);y+=qrSize+S(48);
    ctx.font=`900 ${S(27)}px Arial`;ctx.fillStyle=colors.text;ctx.fillText('ESCANEA AQUÍ',w/2,y);
    ctx.font=`600 ${S(17)}px Arial`;ctx.fillStyle=colors.muted;ctx.fillText('Perfil digital en Aliados Fantasma',w/2,h-S(45));
  }else if(format==='counter'){
    const pad=S(54),qrSize=S(440),logoSize=S(170);
    ctx.fillStyle='rgba(9,13,22,.88)';roundRect(ctx,pad,pad,w-pad*2,h-pad*2,S(38));ctx.fill();ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=S(2);ctx.stroke();
    drawLogo(pad+S(45),pad+S(45),logoSize);
    ctx.textAlign='left';ctx.fillStyle=colors.accent;ctx.font=`800 ${S(27)}px Arial`;ctx.fillText(category.toUpperCase(),pad+S(250),pad+S(95));
    let y=pad+S(165);y=drawWrapped(name,pad+S(250),y,w-qrSize-pad*4-S(250),`900 ${S(56)}px Arial`,S(64),2,colors.text)+S(24);
    y=drawWrapped(posterTitle,pad+S(250),y,w-qrSize-pad*4-S(250),`800 ${S(34)}px Arial`,S(42),2,colors.text)+S(18);
    drawWrapped(cta,pad+S(250),y,w-qrSize-pad*4-S(250),`400 ${S(24)}px Arial`,S(32),3,colors.muted);
    ctx.textAlign='center';drawQr(w-pad-qrSize,pad+S(80),qrSize);
    ctx.font=`900 ${S(28)}px Arial`;ctx.fillStyle=colors.text;ctx.fillText('ESCANEA AQUÍ',w-pad-qrSize/2,pad+qrSize+S(145));
    drawFooter(h-pad-S(92),true);
  }else{
    const pad=S(format==='window'?64:74),innerX=pad,innerY=pad,innerW=w-pad*2,innerH=h-pad*2;
    ctx.fillStyle='rgba(8,12,21,.88)';roundRect(ctx,innerX,innerY,innerW,innerH,S(44));ctx.fill();ctx.strokeStyle='rgba(255,255,255,.13)';ctx.lineWidth=S(2);ctx.stroke();
    const heroH=format==='table'?S(350):S(format==='window'?470:420);
    if(cover){ctx.save();ctx.beginPath();ctx.roundRect(innerX,innerY,innerW,heroH,S(44));ctx.clip();ctx.globalAlpha=.72;drawImageCover(ctx,cover,innerX,innerY,innerW,heroH);ctx.restore();}
    const ov=ctx.createLinearGradient(0,innerY,0,innerY+heroH);ov.addColorStop(0,'rgba(3,7,15,.2)');ov.addColorStop(1,'rgba(7,10,16,.96)');ctx.fillStyle=ov;ctx.fillRect(innerX,innerY,innerW,heroH);
    const logoSize=S(format==='window'?210:180);drawLogo((w-logoSize)/2,innerY+S(55),logoSize);
    let y=innerY+S(format==='window'?330:300);y=drawWrapped(name,w/2,y,innerW-S(100),`900 ${S(format==='window'?60:52)}px Arial`,S(format==='window'?68:60),2,colors.text)+S(8);
    drawWrapped(category.toUpperCase(),w/2,y,innerW-S(120),`800 ${S(25)}px Arial`,S(31),2,colors.accent);
    const contentTop=innerY+heroH+S(42);
    let cy=contentTop;cy=drawWrapped(template==='promotion'?(promotion.titulo||posterTitle):posterTitle,w/2,cy,innerW-S(120),`900 ${S(format==='window'?48:41)}px Arial`,S(format==='window'?57:50),3,colors.text)+S(18);
    const desc=template==='promotion'?(promotion.descripcion||description):description;
    cy=drawWrapped(desc,w/2,cy,innerW-S(160),`400 ${S(24)}px Arial`,S(33),3,colors.muted)+S(28);
    const footerY=innerY+innerH-S(155);
    const available=Math.max(S(250),footerY-cy-S(145));
    const qrSize=Math.min(innerW*.46,available,format==='window'?S(560):S(470));
    drawQr((w-qrSize)/2,cy,qrSize);cy+=qrSize+S(42);
    ctx.font=`900 ${S(33)}px Arial`;ctx.fillStyle=colors.text;ctx.fillText('ESCANEA Y CONOCE',w/2,cy);cy+=S(46);
    drawWrapped(cta,w/2,cy,innerW-S(150),`400 ${S(22)}px Arial`,S(29),2,colors.muted);
    drawFooter(footerY,false);
    ctx.font=`700 ${S(16)}px Arial`;ctx.fillStyle='#9da5b3';ctx.fillText('Perfil digital creado en Aliados Fantasma',w/2,innerY+innerH-S(34));
  }
  ctx.textAlign='left';
}
function downloadPosterPng(){
  const canvas=$('#profile-poster-canvas');
  const link=document.createElement('a');
  const fmt=$('#poster-format')?.value||'a4';link.download=`material-${fmt}-${slugify(state.data.nombre||state.business?.nombre)}.png`;
  link.href=canvas.toDataURL('image/png');link.click();
}
async function downloadPosterPdf(){
  try{
    await renderPrintableProfile();
    if(!window.jspdf?.jsPDF)throw new Error('No se pudo cargar el generador de PDF.');
    const canvas=$('#profile-poster-canvas');
    const image=canvas.toDataURL('image/jpeg',.96);
    const fmt=$('#poster-format')?.value||'a4';
    const pdfCfg={a4:{orientation:'portrait',format:'a4',size:[210,297]},a5:{orientation:'portrait',format:'a5',size:[148,210]},counter:{orientation:'landscape',format:'a5',size:[210,148]},table:{orientation:'portrait',format:[148,210],size:[148,210]},window:{orientation:'portrait',format:'a3',size:[297,420]},card:{orientation:'landscape',format:[90,51],size:[90,51]},label:{orientation:'portrait',format:[80,80],size:[80,80]}}[fmt];
    const pdf=new window.jspdf.jsPDF({orientation:pdfCfg.orientation,unit:'mm',format:pdfCfg.format,compress:true});
    pdf.addImage(image,'JPEG',0,0,pdfCfg.size[0],pdfCfg.size[1],undefined,'FAST');
    pdf.save(`material-${fmt}-${slugify(state.data.nombre||state.business?.nombre)}.pdf`);
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
  ['poster-format','poster-style','poster-show-phone','poster-show-location'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderPrintableProfile));
  $('#download-poster-pdf').onclick=downloadPosterPdf;
  $('#download-poster-png').onclick=async()=>{await renderPrintableProfile();downloadPosterPng();};
  $('#regenerate-calendar').onclick=()=>{state.calendarSeed++;renderCalendar();};
}

bind();loadBusiness().catch(error=>{console.error(error);showMessage(`No fue posible cargar el Centro de Marketing: ${error.message}`,'error');});
