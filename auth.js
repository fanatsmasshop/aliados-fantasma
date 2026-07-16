import { supabase } from "./supabase-client.js";
import { isConfigured } from "./config.js";
export async function requireAdmin(){
  if(!isConfigured||!supabase){location.replace('login.html');return null;}
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user){location.replace('login.html');return null;}
  const {data:profile,error:profileError}=await supabase.from('perfiles').select('id,nombre,rol,activo').eq('id',user.id).maybeSingle();
  if(profileError||!profile||profile.rol!=='administrador'||!profile.activo){await supabase.auth.signOut();alert('Cuenta sin permisos de administrador.');location.replace('login.html');return null;}
  return {user,profile};
}
export async function logout(){await supabase.auth.signOut();location.replace('login.html');}
