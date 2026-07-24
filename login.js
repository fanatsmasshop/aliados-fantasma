import { supabase } from './supabase-client.js?v=20260720-600';
import { isConfigured } from './config.js?v=20260717-2';
import { getActiveContext, setActiveContext, contextHome } from './auth-context.js?v=20260724-CTX-001';

const form=document.querySelector('#login-form');
const email=document.querySelector('#email');
const password=document.querySelector('#password');
const button=document.querySelector('#login-button');
const message=document.querySelector('#login-message');
const warning=document.querySelector('#config-warning');
const modal=document.querySelector('#context-modal');
const options=document.querySelector('#context-options');
let resolving=false;

if(!isConfigured||!supabase){warning.classList.remove('hidden');button.disabled=true;}
else{
  const {data}=await supabase.auth.getSession();
  if(data.session) await resolveAccess(data.session.user, new URLSearchParams(location.search).get('choose')==='1');
}

document.querySelector('#toggle-password').addEventListener('click',event=>{
  const show=password.type==='password'; password.type=show?'text':'password';
  event.currentTarget.textContent=show?'Ocultar':'Ver';
});

async function getAccess(user){
  const [{data:profile},{data:memberships,error}]=await Promise.all([
    supabase.from('perfiles').select('rol,activo,nombre').eq('id',user.id).maybeSingle(),
    supabase.from('miembros_negocio').select('negocio_id,rol,activo,negocios(id,nombre,slug,activo)').eq('perfil_id',user.id).eq('activo',true)
  ]);
  if(error) console.warn(error);
  const businesses=(memberships||[]).filter(x=>x.negocios&&x.negocios.activo!==false);
  return {isAdmin:profile?.rol==='administrador'&&profile?.activo===true,businesses};
}

function chooseContext(user,access){
  modal.classList.remove('hidden'); document.body.classList.add('modal-open');
  options.innerHTML='';
  if(access.isAdmin){
    const b=document.createElement('button'); b.type='button'; b.className='context-option';
    b.innerHTML='<span class="context-icon">🏢</span><span><strong>Administración central</strong><small>Gestionar negocios, solicitudes, accesos y moderación.</small></span><span class="context-arrow">→</span>';
    b.onclick=()=>activate(user,{type:'admin'}); options.appendChild(b);
  }
  access.businesses.forEach(item=>{
    const b=document.createElement('button'); b.type='button'; b.className='context-option';
    b.innerHTML=`<span class="context-icon">🏪</span><span><strong>${escapeHtml(item.negocios.nombre||'Mi negocio')}</strong><small>Entrar como ${escapeHtml(item.rol||'miembro')} y administrar este negocio.</small></span><span class="context-arrow">→</span>`;
    b.onclick=()=>activate(user,{type:'owner',businessId:item.negocio_id,businessName:item.negocios.nombre||'Mi negocio'}); options.appendChild(b);
  });
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function activate(user,context){setActiveContext(user.id,context);location.replace(contextHome(context));}

async function resolveAccess(user,forceChoose=false){
  if(resolving)return; resolving=true;
  try{
    const access=await getAccess(user);
    const saved=getActiveContext(user.id);
    const savedValid=saved && ((saved.type==='admin'&&access.isAdmin)||(saved.type==='owner'&&access.businesses.some(x=>x.negocio_id===saved.businessId)));
    if(savedValid&&!forceChoose){location.replace(contextHome(saved));return;}
    const count=(access.isAdmin?1:0)+access.businesses.length;
    if(count===0){location.replace('estado-cuenta.html');return;}
    if(count===1){
      if(access.isAdmin) activate(user,{type:'admin'});
      else activate(user,{type:'owner',businessId:access.businesses[0].negocio_id,businessName:access.businesses[0].negocios.nombre});
      return;
    }
    chooseContext(user,access);
  }finally{resolving=false;}
}

form.addEventListener('submit',async event=>{
  event.preventDefault();message.textContent='';button.disabled=true;button.querySelector('span').textContent='Ingresando…';
  try{
    const {data,error}=await supabase.auth.signInWithPassword({email:email.value.trim().toLowerCase(),password:password.value});
    if(error){const raw=(error.message||'').toLowerCase();message.textContent=raw.includes('email not confirmed')?'Debes verificar tu correo antes de entrar.':raw.includes('invalid login')?'El correo o la contraseña son incorrectos.':'No pudimos iniciar sesión. Inténtalo nuevamente.';return;}
    await resolveAccess(data.user,true);
  }catch(error){console.error(error);message.textContent='No fue posible conectar con el servicio de acceso.';}
  finally{button.disabled=false;button.querySelector('span').textContent='Entrar';}
});
