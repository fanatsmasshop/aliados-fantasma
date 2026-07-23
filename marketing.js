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
    a4:{w:1240,h:1754,label:'cartel-a4'},
    a5:{w:874,h:1240,label:'cartel-a5'},
    table:{w:1100,h:1550,label:'display-mesa'},
    window:{w:1400,h:2000,label:'escaparate'},
    card:{w:2200,h:720,label:'tarjeta-doble'},
    label:{w:800,h:800,label:'etiqueta-qr'}
  };
  const cfg=formats[format];
  const ctx=canvas.getContext('2d');
  const w=cfg.w,h=cfg.h;canvas.width=w;canvas.height=h;canvas.style.aspectRatio=`${w}/${h}`;
  const template=$('#poster-style')?.value||'commercial';
  const name=state.data.nombre||state.business?.nombre||'Tu negocio';
  const category=state.data.categoria||state.data.giro||'Negocio local';
  const description=state.data.descripcion_corta||state.data.descripcion||'Conoce nuestra información, promociones y formas de contacto.';
  const municipality=state.data.municipio||state.data.alcaldia||'';
  const phone=state.data.whatsapp||state.business?.whatsapp||'';
  const instagram=state.data.instagram||state.data.redes?.instagram||'';
  const promotion=getPromotion();
  const logoUrl=state.data.logo_url||state.business?.logo_url||'aliados-fantasma-icono.webp';
  const coverUrl=state.data.portada_url||logoUrl;
  const [logo,cover,qr]=await Promise.all([loadImage(logoUrl),loadImage(coverUrl),loadImage(state.qrImageUrl)]);
  const posterTitle=$('#poster-title')?.value||'Conoce nuestro perfil digital';
  const cta=$('#poster-cta')?.value||'Escanea el código QR para conocer información, promociones y contacto';
  const showPhone=$('#poster-show-phone')?.checked;
  const showLocation=$('#poster-show-location')?.checked;
  const profileShort=state.profileUrl?state.profileUrl.replace(/^https?:\/\//,'').replace('/perfil.html?slug=','/perfil/'):'Aliados Fantasma';
  const colors={bg:'#070a10',panel:'#10141d',panel2:'#171c27',text:'#ffffff',muted:'#c8ccd6',accent:'#c56dff',blue:'#3478ff',pink:'#ff3a9f',line:'rgba(255,255,255,.14)'};
  const scale=Math.min(w/1240,h/1754);
  const S=n=>Math.max(1,Math.round(n*scale));
  ctx.clearRect(0,0,w,h);ctx.textBaseline='alphabetic';

  const drawText=(text,x,y,maxWidth,font,lineHeight,maxLines,color,align='center')=>{
    ctx.textAlign=align;ctx.font=font;ctx.fillStyle=color;
    const lines=wrapText(ctx,text,maxWidth).slice(0,maxLines);
    lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));
    return y+lines.length*lineHeight;
  };
  const panel=(x,y,pw,ph,r=34,fill='rgba(10,14,24,.9)')=>{ctx.fillStyle=fill;roundRect(ctx,x,y,pw,ph,r);ctx.fill();ctx.strokeStyle=colors.line;ctx.lineWidth=2;ctx.stroke();};
  const logoBox=(x,y,size)=>{
    ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=Math.max(12,size*.1);ctx.fillStyle='#fff';roundRect(ctx,x,y,size,size,size*.18);ctx.fill();ctx.restore();
    if(logo)drawImageContain(ctx,logo,x+size*.08,y+size*.08,size*.84,size*.84);
    else{ctx.fillStyle='#111';ctx.textAlign='center';ctx.font=`900 ${Math.round(size*.23)}px Arial`;ctx.fillText(name.slice(0,2).toUpperCase(),x+size/2,y+size*.61);}
  };
  const qrBox=(x,y,size)=>{
    ctx.save();ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=Math.max(12,size*.08);ctx.fillStyle='#fff';roundRect(ctx,x,y,size,size,size*.1);ctx.fill();ctx.restore();
    if(qr)drawImageContain(ctx,qr,x+size*.065,y+size*.065,size*.87,size*.87);
    else drawText('Genera el QR',x+size/2,y+size*.52,size*.72,`800 ${Math.round(size*.09)}px Arial`,Math.round(size*.11),2,'#111');
  };
  const brandBackground=(alpha=.23)=>{
    ctx.fillStyle=colors.bg;ctx.fillRect(0,0,w,h);
    if(cover){ctx.save();ctx.globalAlpha=alpha;drawImageCover(ctx,cover,0,0,w,h);ctx.restore();}
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(3,13,30,.93)');g.addColorStop(.55,'rgba(8,10,18,.92)');g.addColorStop(1,'rgba(35,7,34,.95)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  };
  const contactLine=()=>[showPhone&&phone?`WhatsApp: ${phone}`:'',showLocation&&municipality?municipality:''].filter(Boolean).join('  •  ');
  const footer=(x,y,pw,textSize=20)=>{
    const txt=contactLine()||profileShort;
    ctx.fillStyle='rgba(255,255,255,.07)';roundRect(ctx,x,y,pw,S(78),999);ctx.fill();
    drawText(txt,x+pw/2,y+S(49),pw-S(50),`700 ${S(textSize)}px Arial`,S(textSize+7),2,'#eef1f7');
  };

  brandBackground(template==='minimal'?.12:.25);

  if(format==='card'){
    // Dos caras reales: 90 x 51 mm, una junto a la otra para impresión y corte.
    const gap=70,cardW=(w-gap*3)/2,cardH=h-gap*2;
    const frontX=gap,backX=gap*2+cardW,y=gap;
    panel(frontX,y,cardW,cardH,38,'rgba(8,12,21,.94)');
    panel(backX,y,cardW,cardH,38,'rgba(8,12,21,.94)');
    if(cover){ctx.save();ctx.globalAlpha=.17;ctx.beginPath();ctx.roundRect(frontX,y,cardW,cardH,38);ctx.clip();drawImageCover(ctx,cover,frontX,y,cardW,cardH);ctx.restore();}
    const logoSize=180;logoBox(frontX+70,y+74,logoSize);
    let ty=y+112;
    drawText(category.toUpperCase(),frontX+300,ty,cardW-370,`800 25px Arial`,31,2,colors.accent,'left');ty+=70;
    ty=drawText(name,frontX+300,ty,cardW-370,`900 52px Arial`,60,2,colors.text,'left')+16;
    drawText(description,frontX+300,ty,cardW-370,`400 25px Arial`,34,3,colors.muted,'left');
    const details=[showPhone&&phone?`WhatsApp  ${phone}`:'',instagram?`Instagram  ${instagram.replace(/^@/,'@')}`:'',showLocation&&municipality?`Ubicación  ${municipality}`:''].filter(Boolean);
    ctx.textAlign='left';ctx.font='700 22px Arial';ctx.fillStyle='#eef1f7';details.slice(0,3).forEach((line,i)=>ctx.fillText(line,frontX+74,y+cardH-120+i*31));
    drawText('FRENTE',frontX+cardW-80,y+cardH-35,110,'700 13px Arial',18,1,'#7f8796');

    const qrSize=320;qrBox(backX+70,y+(cardH-qrSize)/2,qrSize);
    drawText('ESCANEA Y CONOCE',backX+440,y+150,cardW-510,'900 39px Arial',46,2,colors.text,'left');
    drawText(posterTitle,backX+440,y+235,cardW-510,'700 27px Arial',35,3,colors.accent,'left');
    drawText(cta,backX+440,y+350,cardW-510,'400 22px Arial',30,3,colors.muted,'left');
    drawText(profileShort,backX+440,y+cardH-105,cardW-510,'700 19px Arial',25,2,'#dfe3ec','left');
    drawText('REVERSO',backX+cardW-90,y+cardH-35,120,'700 13px Arial',18,1,'#7f8796');
    ctx.strokeStyle='rgba(255,255,255,.25)';ctx.setLineDash([12,12]);ctx.beginPath();ctx.moveTo(w/2,30);ctx.lineTo(w/2,h-30);ctx.stroke();ctx.setLineDash([]);
  }else if(format==='label'){
    const pad=54;panel(pad,pad,w-pad*2,h-pad*2,42,'rgba(8,12,21,.95)');
    const logoSize=120;logoBox((w-logoSize)/2,pad+35,logoSize);
    let y=pad+205;y=drawText(name,w/2,y,w-150,'900 42px Arial',49,2,colors.text)+8;
    drawText(category.toUpperCase(),w/2,y,w-170,'800 19px Arial',25,2,colors.accent);
    const qrSize=350;qrBox((w-qrSize)/2,pad+300,qrSize);
    drawText('ESCANEA AQUÍ',w/2,pad+700,w-130,'900 28px Arial',34,1,colors.text);
    drawText('Conoce nuestro perfil, contacto y promociones',w/2,pad+742,w-150,'500 16px Arial',22,2,colors.muted);
  }else if(format==='table'){
    // Display plegable: mitad superior y mitad inferior simétricas, con línea de doblez.
    const pad=55,half=(h-pad*2)/2;
    panel(pad,pad,w-pad*2,h-pad*2,38,'rgba(8,12,21,.93)');
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.setLineDash([14,12]);ctx.beginPath();ctx.moveTo(pad,h/2);ctx.lineTo(w-pad,h/2);ctx.stroke();ctx.setLineDash([]);
    drawText('LÍNEA DE DOBLEZ',w/2,h/2-10,w-160,'700 14px Arial',20,1,'#8f97a6');
    const renderHalf=(oy)=>{
      const logoSize=145;logoBox(pad+55,oy+45,logoSize);
      drawText(name,pad+235,oy+92,w-pad*2-300,'900 45px Arial',52,2,colors.text,'left');
      drawText(category.toUpperCase(),pad+235,oy+150,w-pad*2-300,'800 21px Arial',27,2,colors.accent,'left');
      const qrSize=290;qrBox(w-pad-qrSize-55,oy+205,qrSize);
      drawText(posterTitle,pad+55,oy+270,w-pad*2-qrSize-150,'900 36px Arial',43,3,colors.text,'left');
      drawText(cta,pad+55,oy+410,w-pad*2-qrSize-150,'400 22px Arial',30,4,colors.muted,'left');
      footer(pad+55,oy+half-105,w-pad*2-110,18);
    };
    renderHalf(pad);renderHalf(h/2+18);
  }else if(format==='window'){
    const pad=62;panel(pad,pad,w-pad*2,h-pad*2,48,'rgba(8,12,21,.9)');
    if(cover){ctx.save();ctx.globalAlpha=.68;ctx.beginPath();ctx.roundRect(pad,pad,w-pad*2,610,48);ctx.clip();drawImageCover(ctx,cover,pad,pad,w-pad*2,610);ctx.restore();}
    const ov=ctx.createLinearGradient(0,pad,0,pad+610);ov.addColorStop(0,'rgba(4,7,14,.12)');ov.addColorStop(1,'rgba(7,10,16,.96)');ctx.fillStyle=ov;ctx.fillRect(pad,pad,w-pad*2,610);
    logoBox((w-220)/2,pad+70,220);
    let y=pad+390;y=drawText(name,w/2,y,w-180,'900 68px Arial',78,2,colors.text)+4;
    drawText(category.toUpperCase(),w/2,y,w-220,'800 28px Arial',34,2,colors.accent);
    y=pad+735;
    const headline=template==='promotion'?(promotion.titulo||posterTitle):posterTitle;
    y=drawText(headline,w/2,y,w-180,'900 59px Arial',70,3,colors.text)+25;
    drawText(template==='promotion'?(promotion.descripcion||description):description,w/2,y,w-250,'400 28px Arial',39,4,colors.muted);
    const qrSize=500;qrBox((w-qrSize)/2,1120,qrSize);
    drawText('ESCANEA Y CONOCE MÁS',w/2,1665,w-180,'900 38px Arial',46,2,colors.text);
    drawText(cta,w/2,1725,w-230,'400 24px Arial',32,3,colors.muted);
    footer(110,1840,w-220,20);
  }else{
    // Carteles A4 y A5: composición editorial, no una tarjeta ampliada.
    const pad=S(68),heroH=S(format==='a4'?470:360);panel(pad,pad,w-pad*2,h-pad*2,S(44),'rgba(8,12,21,.91)');
    if(cover){ctx.save();ctx.globalAlpha=.66;ctx.beginPath();ctx.roundRect(pad,pad,w-pad*2,heroH,S(44));ctx.clip();drawImageCover(ctx,cover,pad,pad,w-pad*2,heroH);ctx.restore();}
    const ov=ctx.createLinearGradient(0,pad,0,pad+heroH);ov.addColorStop(0,'rgba(4,7,14,.12)');ov.addColorStop(1,'rgba(7,10,16,.97)');ctx.fillStyle=ov;ctx.fillRect(pad,pad,w-pad*2,heroH);
    const logoSize=S(format==='a4'?190:145);logoBox((w-logoSize)/2,pad+S(45),logoSize);
    let y=pad+S(format==='a4'?310:245);y=drawText(name,w/2,y,w-pad*2-S(70),`900 ${S(format==='a4'?55:46)}px Arial`,S(format==='a4'?63:53),2,colors.text)+S(8);
    drawText(category.toUpperCase(),w/2,y,w-pad*2-S(90),`800 ${S(format==='a4'?24:21)}px Arial`,S(30),2,colors.accent);
    y=pad+heroH+S(55);
    const headline=template==='promotion'?(promotion.titulo||posterTitle):posterTitle;
    y=drawText(headline,w/2,y,w-pad*2-S(90),`900 ${S(format==='a4'?44:37)}px Arial`,S(format==='a4'?52:45),3,colors.text)+S(18);
    y=drawText(template==='promotion'?(promotion.descripcion||description):description,w/2,y,w-pad*2-S(130),`400 ${S(format==='a4'?23:20)}px Arial`,S(format==='a4'?32:28),4,colors.muted)+S(25);
    const footerY=h-pad-S(155);const available=footerY-y-S(155);const qrSize=Math.min(w*.42,available,S(format==='a4'?430:330));qrBox((w-qrSize)/2,y,qrSize);y+=qrSize+S(38);
    drawText('ESCANEA Y CONOCE',w/2,y,w-pad*2-S(70),`900 ${S(format==='a4'?31:27)}px Arial`,S(38),2,colors.text);y+=S(45);
    drawText(cta,w/2,y,w-pad*2-S(120),`400 ${S(format==='a4'?20:18)}px Arial`,S(27),3,colors.muted);
    footer(pad+S(42),footerY,w-pad*2-S(84),format==='a4'?20:18);
    drawText('Perfil digital creado en Aliados Fantasma',w/2,h-pad-S(28),w-pad*2,'700 13px Arial',18,1,'#939baa');
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
    const pdfCfg={a4:{orientation:'portrait',format:'a4',size:[210,297]},a5:{orientation:'portrait',format:'a5',size:[148,210]},table:{orientation:'portrait',format:[148,210],size:[148,210]},window:{orientation:'portrait',format:'a3',size:[297,420]},card:{orientation:'landscape',format:[190,62],size:[190,62]},label:{orientation:'portrait',format:[80,80],size:[80,80]}}[fmt];
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
