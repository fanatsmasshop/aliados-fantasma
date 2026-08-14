import { supabase } from './supabase-client.js?v=20260724-RC1';

const loading=document.querySelector('#verify-loading');
const success=document.querySelector('#verify-success');
const box=document.querySelector('#verify-error');
const msg=document.querySelector('#verify-message');
let finished=false;

async function finish(ok,text=''){
  if(finished)return;finished=true;
  loading?.classList.add('hidden');
  if(ok){
    success?.classList.remove('hidden');
    try{await supabase.rpc('usuario_sincronizar_mi_pre_registro');}catch(error){console.warn('La cuenta se sincronizará al entrar:',error);}
    setTimeout(()=>location.replace('panel.html'),700);
  }else{
    if(msg)msg.textContent=text||'El enlace pudo caducar o ya fue utilizado.';
    box?.classList.remove('hidden');
  }
}

try{
  if(!supabase)throw new Error('El servicio de acceso no está configurado.');
  const query=new URLSearchParams(location.search);
  const hash=new URLSearchParams(location.hash.slice(1));
  const authError=query.get('error_description')||hash.get('error_description');
  if(authError)throw new Error(decodeURIComponent(authError.replace(/\+/g,' ')));
  const code=query.get('code');
  const tokenHash=query.get('token_hash');
  const type=query.get('type');
  if(code){const {error}=await supabase.auth.exchangeCodeForSession(code);if(error)throw error;}
  else if(tokenHash&&type){const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type});if(error)throw error;}
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  if(data.session?.user?.email_confirmed_at){await finish(true);}
  else{
    const {data:listener}=supabase.auth.onAuthStateChange(async(_event,session)=>{if(session?.user?.email_confirmed_at){listener.subscription.unsubscribe();await finish(true);}});
    setTimeout(()=>{listener.subscription.unsubscribe();finish(false,'No recibimos una sesión válida. Abre nuevamente el enlace desde el mismo navegador o inicia sesión con tu correo confirmado.');},9000);
  }
}catch(error){console.error(error);finish(false,error.message);}
