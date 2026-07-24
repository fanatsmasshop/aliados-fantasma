import { supabase } from './supabase-client.js?v=20260720-600';
import { isConfigured } from './config.js?v=20260717-2';
import { requireContext, clearActiveContext } from './auth-context.js?v=20260724-CTX-001';
export async function requireAdmin(){
  if(!isConfigured||!supabase){location.replace('login.html');return null;}
  const {data:userData,error:userError}=await supabase.auth.getUser(); const user=userData?.user;
  if(userError||!user){location.replace('login.html');return null;}
  if(!requireContext(user.id,'admin')) return null;
  const {data:profile,error}=await supabase.from('perfiles').select('id,nombre,rol,activo').eq('id',user.id).maybeSingle();
  if(error||!profile||profile.rol!=='administrador'||profile.activo!==true){clearActiveContext(user.id);await supabase.auth.signOut();location.replace('login.html');return null;}
  return {user,profile};
}
export async function logout(){const {data}=await supabase.auth.getUser();clearActiveContext(data?.user?.id);await supabase.auth.signOut();location.replace('login.html');}
