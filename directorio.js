import { supabase } from './supabase-client.js?v=20260721-700';
import { esc } from './ui.js?v=20260721-700';
import { getLaunchState, isAdministrator, LAUNCH_LABEL } from './launch-control.js?v=20260721-700';

const PAGE_SIZE=12;
const state={businesses:[],filtered:[],categories:[],visible:PAGE_SIZE,query:'',category:'',municipality:'',open:false,promotion:false,isNew:false,featured:false,sort:'recommended'};
const el={content:document.querySelector('#directory-content'),gate:document.querySelector('#directory-gate'),gateMessage:document.querySelector('#gate-message'),preview:document.querySelector('#launch-preview-banner'),search:document.querySelector('#directory-search'),searchButton:document.querySelector('#search-button'),clear:document.querySelector('#clear-search'),quick:document.querySelector('#quick-categories'),category:document.querySelector('#category-filter'),municipality:document.querySelector('#municipality-filter'),open:document.querySelector('#open-filter'),promotion:document.querySelector('#promotion-filter'),newFilter:document.querySelector('#new-filter'),featured:document.querySelector('#featured-filter'),sort:document.querySelector('#sort-filter'),reset:document.querySelector('#reset-filters'),emptyReset:document.querySelector('#empty-reset'),grid:document.querySelector('#directory-grid'),empty:document.querySelector('#directory-empty'),summary:document.querySelector('#results-summary'),active:document.querySelector('#active-filters'),loadMore:document.querySelector('#load-more'),featuredSection:document.querySelector('#featured-section'),featuredGrid:document.querySelector('#featured-grid'),toast:document.querySelector('#directory-toast')};

const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const digits=v=>String(v||'').replace(/\D/g,'');
const safeUrl=v=>{try{const u=new URL(String(v||''),location.href);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const dayNumber=()=>{const d=new Date().getDay();return d===0?7:d;};
const timeMinutes=v=>{const [h,m]=String(v||'').slice(0,5).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;};
const isOpenNow=business=>{const h=business.horarios.find(x=>Number(x.dia_semana)===dayNumber());if(!h||h.cerrado)return false;if(h.abierto_24_horas)return true;const now=new Date();const current=now.getHours()*60+now.getMinutes(),open=timeMinutes(h.hora_apertura),close=timeMinutes(h.hora_cierre);if(open===null||close===null)return false;return close>open?current>=open&&current<close:current>=open||current<close;};
const activePromotions=business=>business.promociones.filter(p=>p.activa!==false&&(!p.fecha_inicio||new Date(p.fecha_inicio)<=new Date())&&(!p.fecha_fin||new Date(p.fecha_fin)>=new Date()));
const isNewBusiness=business=>{if(!business.created_at)return false;return Date.now()-new Date(business.created_at).getTime()<=45*86400000;};
const completeness=business=>{const fields=['nombre','descripcion_corta','descripcion','whatsapp','direccion','municipio','logo_url'];const present=fields.filter(k=>String(business[k]||'').trim()).length;return Math.round((present/fields.length)*100);};
const dailyRotation=id=>{const day=Math.floor(Date.now()/86400000);let hash=day;for(const c of String(id||''))hash=((hash<<5)-hash)+c.charCodeAt(0);return Math.abs(hash%1000)/1000;};

function relevance(b,q){if(!q)return 0;const terms=normalize(q).split(/\s+/).filter(Boolean);const fields={nombre:normalize(b.nombre),categoria:normalize(b.categoria),descripcion:normalize(`${b.descripcion_corta||''} ${b.descripcion||''}`),ubicacion:normalize(`${b.colonia||''} ${b.municipio||''} ${b.direccion||''}`)};return terms.reduce((score,t)=>score+(fields.nombre===t?100:0)+(fields.nombre.includes(t)?45:0)+(fields.categoria.includes(t)?32:0)+(fields.ubicacion.includes(t)?22:0)+(fields.descripcion.includes(t)?10:0),0);}
function recommendationScore(b){let score=0;score+=b.destacado?30:0;score+=activePromotions(b).length?20:0;score+=Math.round(completeness(b)*.15);score+=isOpenNow(b)?10:0;score+=b.verificado?10:0;score+=isNewBusiness(b)?8:0;score+=b.updated_at&&Date.now()-new Date(b.updated_at).getTime()<30*86400000?5:0;score+=dailyRotation(b.id)*7;score+=relevance(b,state.query);return score;}

function showToast(message){el.toast.textContent=message;el.toast.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.toast.classList.add('hidden'),2400);}
function businessLocation(b){return [b.colonia,b.municipio].filter(Boolean).join(', ')||b.municipio||'Estado de México';}
function profileUrl(b){return `perfil.html?slug=${encodeURIComponent(b.slug)}`;}
function coverUrl(b){return safeUrl(b.portada_url);}
function hasCover(b){return Boolean(coverUrl(b));}
function logoUrl(b){return safeUrl(b.logo_url)||'aliados-fantasma-icono.webp';}
function badges(b){const list=[];if(isOpenNow(b))list.push('<span class="business-badge open">● Abierto</span>');if(activePromotions(b).length)list.push('<span class="business-badge promo">🔥 Promoción</span>');if(isNewBusiness(b))list.push('<span class="business-badge new">Nuevo</span>');if(b.destacado)list.push('<span class="business-badge">⭐ Destacado</span>');return list.join('');}
function whatsappUrl(b){const d=digits(b.whatsapp||b.telefono);return d?`https://wa.me/${d}?text=${encodeURIComponent(`Hola, encontré ${b.nombre} en Aliados Fantasma.`)}`:'';}

function fallbackMediaStyle(logo){
  return `style="--fallback-image:url('${String(logo).replace(/'/g,"%27")}')"`;
}

function cardMarkup(b){
  const wa=whatsappUrl(b);
  const logo=logoUrl(b);
  const background=coverUrl(b)||logo;
  return `<article class="business-card compact-card" data-id="${esc(b.id)}">
    <div class="compact-backdrop" aria-hidden="true">
      <img src="${esc(background)}" data-fallback="${esc(logo)}" alt="" loading="lazy" decoding="async">
      <span></span>
    </div>
    <div class="compact-card-inner">
      <img class="compact-logo" src="${esc(logo)}" alt="Logo de ${esc(b.nombre)}" loading="lazy" decoding="async">
      <div class="compact-main">
        <div class="compact-heading">
          <div class="compact-copy">
            <h3>${esc(b.nombre)}</h3>
            <p>${esc(b.descripcion_corta||b.descripcion||b.categoria||'Negocio aliado')}</p>
          </div>
          <div class="compact-actions">
            <a class="compact-profile" href="${esc(profileUrl(b))}" data-event="profile" aria-label="Ver perfil de ${esc(b.nombre)}"><span>Ver perfil</span></a>
            ${wa?`<a class="compact-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener" data-event="whatsapp" aria-label="Contactar a ${esc(b.nombre)} por WhatsApp">WA</a>`:'<button class="compact-whatsapp" type="button" disabled aria-label="WhatsApp no disponible">—</button>'}
          </div>
        </div>
        <div class="compact-location">📍 ${esc(businessLocation(b))}</div>
        <div class="business-badges compact-badges">${badges(b)}</div>
      </div>
    </div>
  </article>`;
}

function spotlightMarkup(b){
  const wa=whatsappUrl(b);
  const logo=logoUrl(b);
  const background=coverUrl(b)||logo;
  return `<article class="spotlight-card compact-spotlight" data-id="${esc(b.id)}">
    <div class="spotlight-backdrop" aria-hidden="true">
      <img src="${esc(background)}" data-fallback="${esc(logo)}" alt="" loading="lazy" decoding="async">
      <span></span>
    </div>
    <div class="spotlight-inner">
      <img class="spotlight-side-logo" src="${esc(logo)}" alt="Logo de ${esc(b.nombre)}" loading="lazy" decoding="async">
      <div class="spotlight-main">
        <div class="business-badges compact-badges">${badges(b)}</div>
        <h3>${esc(b.nombre)}</h3>
        <p>${esc(b.categoria||'Negocio aliado')}</p>
        <div class="spotlight-location">📍 ${esc(businessLocation(b))}</div>
        <div class="spotlight-actions compact-spotlight-actions">
          <a href="${esc(profileUrl(b))}" data-event="profile">Ver perfil</a>
          ${wa?`<a class="spotlight-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener" data-event="whatsapp" aria-label="WhatsApp de ${esc(b.nombre)}">WA</a>`:''}
        </div>
      </div>
    </div>
  </article>`;
}


function generatedMediaMarkup(media,logo,name){
  const isSpotlight=media.classList.contains('spotlight-media');
  media.className=isSpotlight?'spotlight-media spotlight-media-generated':'business-media business-media-generated';
  media.setAttribute('style',`--fallback-image:url('${String(logo).replace(/'/g,"%27")}')`);
  media.innerHTML=isSpotlight
    ? `<div class="generated-cover-overlay"></div><img class="spotlight-logo spotlight-logo-generated" src="${esc(logo)}" alt="Logo de ${esc(name)}" loading="lazy" decoding="async">`
    : `<div class="generated-cover-overlay"></div><img class="business-logo business-logo-generated" src="${esc(logo)}" alt="Logo de ${esc(name)}" loading="lazy" decoding="async">`;
  media.closest('.business-card,.spotlight-card')?.classList.remove('has-cover');
  media.closest('.business-card,.spotlight-card')?.classList.add('no-cover');
}


function bindCoverFallbacks(root){
  root.querySelectorAll('.compact-backdrop img,.spotlight-backdrop img').forEach(img=>{
    const fallback=()=>{
      const next=img.dataset.fallback;
      if(next&&img.src!==next){img.src=next;return;}
      img.style.display='none';
    };
    img.addEventListener('error',fallback,{once:true});
    if(img.complete&&img.naturalWidth===0)fallback();
  });
}

function populateFilters(){el.category.innerHTML='<option value="">Todas las categorías</option>'+state.categories.map(c=>`<option value="${esc(c.nombre)}">${esc(c.nombre)}</option>`).join('');const municipalities=[...new Set(state.businesses.map(b=>b.municipio).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));el.municipality.innerHTML='<option value="">Todos los municipios</option>'+municipalities.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');el.quick.innerHTML=state.categories.slice(0,8).map(c=>`<button class="quick-category" type="button" data-category="${esc(c.nombre)}">${esc(c.icono||'')} ${esc(c.nombre)}</button>`).join('');el.quick.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{state.category=state.category===btn.dataset.category?'':btn.dataset.category;el.category.value=state.category;state.visible=PAGE_SIZE;applyFilters();}));}

function filterBusinesses(){const q=normalize(state.query);return state.businesses.filter(b=>{if(q&&!relevance(b,q))return false;if(state.category&&b.categoria!==state.category)return false;if(state.municipality&&b.municipio!==state.municipality)return false;if(state.open&&!isOpenNow(b))return false;if(state.promotion&&!activePromotions(b).length)return false;if(state.isNew&&!isNewBusiness(b))return false;if(state.featured&&!b.destacado)return false;return true;});}
function sortBusinesses(items){return [...items].sort((a,b)=>{if(state.sort==='name')return a.nombre.localeCompare(b.nombre,'es');if(state.sort==='newest')return new Date(b.created_at||0)-new Date(a.created_at||0);if(state.sort==='open')return Number(isOpenNow(b))-Number(isOpenNow(a))||recommendationScore(b)-recommendationScore(a);if(state.sort==='promotions')return activePromotions(b).length-activePromotions(a).length||recommendationScore(b)-recommendationScore(a);return recommendationScore(b)-recommendationScore(a);});}

function renderActiveFilters(){const chips=[];if(state.query)chips.push(['query',`Búsqueda: ${state.query}`]);if(state.category)chips.push(['category',state.category]);if(state.municipality)chips.push(['municipality',state.municipality]);if(state.open)chips.push(['open','Abiertos ahora']);if(state.promotion)chips.push(['promotion','Con promoción']);if(state.isNew)chips.push(['isNew','Nuevos']);if(state.featured)chips.push(['featured','Destacados']);el.active.classList.toggle('hidden',!chips.length);el.active.innerHTML=chips.map(([key,label])=>`<span class="filter-chip">${esc(label)} <button type="button" data-remove="${key}" aria-label="Quitar filtro ${esc(label)}">×</button></span>`).join('');el.active.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>removeFilter(btn.dataset.remove)));}
function removeFilter(key){if(key==='query'){state.query='';el.search.value='';}else if(key==='category'){state.category='';el.category.value='';}else if(key==='municipality'){state.municipality='';el.municipality.value='';}else if(key==='open'){state.open=false;el.open.checked=false;}else if(key==='promotion'){state.promotion=false;el.promotion.checked=false;}else if(key==='isNew'){state.isNew=false;el.newFilter.checked=false;}else if(key==='featured'){state.featured=false;el.featured.checked=false;}state.visible=PAGE_SIZE;applyFilters();}
function renderFeatured(){if(state.query||state.category||state.municipality||state.open||state.promotion||state.isNew||state.featured){el.featuredSection.classList.add('hidden');return;}const selection=sortBusinesses(state.businesses).slice(0,3);el.featuredSection.classList.toggle('hidden',!selection.length);el.featuredGrid.innerHTML=selection.map(spotlightMarkup).join('');bindCoverFallbacks(el.featuredGrid);bindTracking(el.featuredGrid);}
function renderResults(){const shown=state.filtered.slice(0,state.visible);el.grid.innerHTML=shown.map(cardMarkup).join('');el.empty.classList.toggle('hidden',state.filtered.length>0);el.grid.classList.toggle('hidden',state.filtered.length===0);el.loadMore.classList.toggle('hidden',state.visible>=state.filtered.length);el.summary.textContent=`${state.filtered.length} negocio${state.filtered.length===1?'':'s'} encontrado${state.filtered.length===1?'':'s'}`;bindCoverFallbacks(el.grid);bindTracking(el.grid);}
function applyFilters({trackSearch=false}={}){state.filtered=sortBusinesses(filterBusinesses());renderActiveFilters();renderFeatured();renderResults();el.clear.classList.toggle('hidden',!state.query);el.quick.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));if(trackSearch&&state.query)trackEvent('busqueda',null,{query:state.query,resultados:state.filtered.length});}
function resetAll(){Object.assign(state,{query:'',category:'',municipality:'',open:false,promotion:false,isNew:false,featured:false,sort:'recommended',visible:PAGE_SIZE});el.search.value='';el.category.value='';el.municipality.value='';el.open.checked=false;el.promotion.checked=false;el.newFilter.checked=false;el.featured.checked=false;el.sort.value='recommended';applyFilters();}

async function trackEvent(tipo,negocioId=null,metadata={}){try{await supabase.rpc('registrar_evento_directorio',{p_tipo:tipo,p_negocio_id:negocioId,p_consulta:metadata.query||null,p_metadata:metadata});}catch{/* Las métricas nunca deben bloquear la navegación. */}}
function bindTracking(root){root.querySelectorAll('[data-event]').forEach(node=>node.addEventListener('click',()=>trackEvent(node.dataset.event,node.closest('[data-id]')?.dataset.id||node.dataset.id||null,{origen:'directorio'}),{once:true}));}

function wireEvents(){let debounce;el.search.addEventListener('input',()=>{state.query=el.search.value.trim();state.visible=PAGE_SIZE;clearTimeout(debounce);debounce=setTimeout(()=>applyFilters(),180);});el.search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyFilters({trackSearch:true});}});el.searchButton.addEventListener('click',()=>{state.query=el.search.value.trim();state.visible=PAGE_SIZE;applyFilters({trackSearch:true});});el.clear.addEventListener('click',()=>removeFilter('query'));el.category.addEventListener('change',()=>{state.category=el.category.value;state.visible=PAGE_SIZE;applyFilters();});el.municipality.addEventListener('change',()=>{state.municipality=el.municipality.value;state.visible=PAGE_SIZE;applyFilters();});[[el.open,'open'],[el.promotion,'promotion'],[el.newFilter,'isNew'],[el.featured,'featured']].forEach(([node,key])=>node.addEventListener('change',()=>{state[key]=node.checked;state.visible=PAGE_SIZE;applyFilters();}));el.sort.addEventListener('change',()=>{state.sort=el.sort.value;applyFilters();});el.reset.addEventListener('click',resetAll);el.emptyReset.addEventListener('click',resetAll);el.loadMore.addEventListener('click',()=>{state.visible+=PAGE_SIZE;renderResults();});}

async function loadDirectory(){el.grid.innerHTML='<div class="directory-skeleton"></div><div class="directory-skeleton"></div><div class="directory-skeleton"></div>';const {data:businesses,error}=await supabase.from('negocios').select('*,categorias(nombre,icono)').eq('activo',true);if(error)throw error;const ids=(businesses||[]).map(b=>b.id);let promotions=[],hours=[];if(ids.length){const [promoResult,hourResult]=await Promise.all([supabase.from('promociones').select('*').in('negocio_id',ids).eq('activa',true),supabase.from('horarios_negocio').select('*').in('negocio_id',ids)]);promotions=promoResult.data||[];hours=hourResult.data||[];}state.businesses=(businesses||[]).map(b=>({...b,categoria:b.categorias?.nombre||'Negocio aliado',categoriaIcono:b.categorias?.icono||'',promociones:promotions.filter(p=>p.negocio_id===b.id),horarios:hours.filter(h=>h.negocio_id===b.id)}));const {data:categories}=await supabase.from('categorias').select('nombre,icono,orden').eq('activa',true).order('orden');state.categories=categories||[];populateFilters();applyFilters();trackEvent('vista_directorio',null,{negocios:state.businesses.length});}

async function init(){wireEvents();const launch=await getLaunchState();const admin=await isAdministrator();if(!launch.open&&!admin){el.gateMessage.textContent=`Se habilitará automáticamente el ${LAUNCH_LABEL}. Mientras tanto, los negocios pueden registrarse y preparar su perfil.`;el.gate.classList.remove('hidden');return;}if(!launch.open&&admin)el.preview.classList.remove('hidden');el.content.classList.remove('hidden');try{await loadDirectory();}catch(error){console.error(error);el.grid.innerHTML='';el.empty.classList.remove('hidden');el.empty.querySelector('h3').textContent='No fue posible cargar el directorio';el.empty.querySelector('p').textContent='Revisa tu conexión e inténtalo nuevamente.';el.summary.textContent='Error de conexión';showToast('No fue posible cargar los negocios');}}
init();
