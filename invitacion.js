import { supabase } from './supabase-client.js?v=20260717-2';
const title=document.querySelector('#invite-title');
const message=document.querySelector('#invite-message');
const actions=document.querySelector('#invite-actions');
const token=new URLSearchParams(location.search).get('token');
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
async function init(){
 if(!token){title.textContent='Enlace incompleto';message.textContent='La invitación no contiene un token válido.';return;}
 const {data:{user}}=await supabase.auth.getUser();
 if(!user){title.textContent='Inicia sesión para aceptar';message.textContent='Debes entrar con el mismo correo al que se envió la invitación.';actions.innerHTML=`<a class="button primary" href="login.html?redirect=${encodeURIComponent(location.href)}">Iniciar sesión</a><a class="button secondary" href="registro.html">Crear cuenta</a>`;return;}
 title.textContent='Aceptar administración del negocio';message.textContent=`Sesión iniciada como ${user.email}.`;
 actions.innerHTML='<button id="accept-invite" class="button primary">Aceptar invitación</button>';
 document.querySelector('#accept-invite').onclick=async()=>{const b=document.querySelector('#accept-invite');b.disabled=true;b.textContent='Aceptando…';const {data,error}=await supabase.rpc('aceptar_invitacion_negocio',{p_token:token});if(error){title.textContent='No fue posible aceptar';message.textContent=error.message;b.remove();return;}title.textContent='Invitación aceptada';message.innerHTML=`Ya tienes acceso al negocio. Rol asignado: <strong>${esc(data?.rol||'miembro')}</strong>.`;actions.innerHTML='<a class="button primary" href="panel.html">Abrir mi panel</a>';};
}
init().catch(error=>{title.textContent='Error';message.textContent=error.message;});
