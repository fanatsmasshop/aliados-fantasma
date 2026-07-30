import { supabase } from './supabase-client.js?v=20260717-2';
import { isStrongPassword, PASSWORD_HELP } from './auth-validation.js?v=20260730-F1FIX';

const title=document.querySelector('#invite-title');
const message=document.querySelector('#invite-message');
const actions=document.querySelector('#invite-actions');
const params=new URLSearchParams(location.search);
const token=params.get('token');
const authType=new URLSearchParams(location.hash.replace(/^#/, '')).get('type');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function showError(heading,text){
  title.textContent=heading;
  message.textContent=text;
  actions.innerHTML='<a class="button secondary" href="index.html">Volver al inicio</a>';
}

async function resolveUser(){
  const {data:{session}}=await supabase.auth.getSession();
  if(session?.user) return session.user;
  await new Promise(resolve=>setTimeout(resolve,250));
  const {data:{user}}=await supabase.auth.getUser();
  return user||null;
}

function renderLogin(){
  title.textContent='Inicia sesión para aceptar';
  message.textContent='Debes entrar con el mismo correo al que se envió la invitación.';
  const returnUrl=`invitacion.html?token=${encodeURIComponent(token)}`;
  actions.innerHTML=`<a class="button primary" href="login.html?return=${encodeURIComponent(returnUrl)}">Iniciar sesión</a><a class="button secondary" href="registro.html">Crear cuenta</a>`;
}

function renderAcceptance(user){
  title.textContent='Activa tu acceso al negocio';
  message.innerHTML=`La invitación está asociada a <strong>${esc(user.email)}</strong>.`;
  const needsPassword=authType==='invite';
  actions.innerHTML=`
    ${needsPassword?`<div style="width:100%;display:grid;gap:12px;text-align:left">
      <label><span>Crea una contraseña</span><input id="invite-password" type="password" minlength="8" autocomplete="new-password" placeholder="8 caracteres, mayúscula y número"></label>
      <label><span>Confirma la contraseña</span><input id="invite-password-confirm" type="password" minlength="8" autocomplete="new-password" placeholder="Repite la contraseña"></label>
    </div>`:''}
    <button id="accept-invite" class="button primary" type="button">${needsPassword?'Crear contraseña y aceptar':'Aceptar invitación'}</button>
    <a class="button secondary" href="panel.html">Cancelar</a>`;

  document.querySelector('#accept-invite').onclick=async()=>{
    const button=document.querySelector('#accept-invite');
    button.disabled=true;
    button.textContent='Procesando…';
    try{
      if(needsPassword){
        const password=document.querySelector('#invite-password').value;
        const confirm=document.querySelector('#invite-password-confirm').value;
        if(!isStrongPassword(password)) throw new Error(PASSWORD_HELP);
        if(password!==confirm) throw new Error('Las contraseñas no coinciden.');
        const {error:passwordError}=await supabase.auth.updateUser({password});
        if(passwordError) throw passwordError;
      }

      const {data,error}=await supabase.rpc('aceptar_invitacion_negocio',{p_token:token});
      if(error) throw error;
      title.textContent='Acceso activado';
      message.innerHTML=`Ya puedes administrar este negocio con el rol <strong>${esc(data?.rol||'miembro')}</strong>.`;
      actions.innerHTML='<a class="button primary" href="panel.html">Abrir mi panel</a>';
      history.replaceState({},document.title,'invitacion.html');
    }catch(error){
      button.disabled=false;
      button.textContent=needsPassword?'Crear contraseña y aceptar':'Aceptar invitación';
      message.textContent=error.message||'No fue posible aceptar la invitación.';
    }
  };
}

async function init(){
  if(!token) return showError('Enlace incompleto','La invitación no contiene un token válido.');

  const hashParams=new URLSearchParams(location.hash.replace(/^#/,''));
  if(hashParams.get('error')){
    return showError('El enlace no pudo abrirse',hashParams.get('error_description')||'Solicita una nueva invitación.');
  }

  const user=await resolveUser();
  if(!user) return renderLogin();
  renderAcceptance(user);
}

init().catch(error=>showError('No fue posible abrir la invitación',error.message));
