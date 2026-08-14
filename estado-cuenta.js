import { supabase } from './supabase-client.js?v=20260724-RC1';
const loading=document.querySelector('#state-loading');
const content=document.querySelector('#state-content');
const errorBox=document.querySelector('#state-error');
const action=document.querySelector('#profile-action');
function fail(text){loading?.classList.add('hidden');const out=document.querySelector('#state-error-text');if(out)out.textContent=text;errorBox?.classList.remove('hidden');}
async function loadState(){
  try{
    if(!supabase)throw new Error('El servicio de acceso no está configurado.');
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user){location.replace('login.html');return;}
    try{await supabase.rpc('usuario_sincronizar_mi_pre_registro');}catch(syncError){console.warn('Sincronización:',syncError);}
    const {data:preData,error:preError}=await supabase.rpc('usuario_obtener_mi_pre_registro');
    if(preError)throw preError;
    const row=Array.isArray(preData)?preData[0]:preData;
    if(user.email_confirmed_at && row?.correo_verificado===true){location.replace('panel.html');return;}
    loading?.classList.add('hidden');content?.classList.remove('hidden');
    document.querySelector('#state-business').textContent=row?.nombre_negocio||'Tu negocio';
    document.querySelector('#state-email').textContent=user.email||row?.correo||'';
    document.querySelector('#state-verified').innerHTML='<span class="status-pill pending">Pendiente de confirmar</span>';
    document.querySelector('#state-status').textContent='Se habilita al verificar el correo';
    document.querySelector('#state-note').innerHTML='Abre el correo de Aliados Fantasma y confirma tu cuenta. <strong>No necesitas esperar una aprobación manual.</strong>';
    action.href='login.html';action.textContent='Ya confirmé · Iniciar sesión';
  }catch(error){console.error(error);fail('No pudimos consultar tu cuenta. Vuelve a iniciar sesión.');}
}
await loadState();
document.querySelector('#state-logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html');});
