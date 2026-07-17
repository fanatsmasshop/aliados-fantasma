import { supabase } from './supabase-client.js?v=20260717-2';
import { isConfigured } from './config.js?v=20260717-2';

export async function requireAdmin() {
  if (!isConfigured || !supabase) {
    location.replace('login.html');
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;

  if (userError || !user) {
    location.replace('login.html');
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('perfiles')
    .select('id,nombre,rol,activo')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.rol !== 'administrador' || profile.activo !== true) {
    await supabase.auth.signOut();
    alert('Esta cuenta no tiene permisos de administrador.');
    location.replace('login.html');
    return null;
  }

  return { user, profile };
}

export async function logout() {
  await supabase.auth.signOut();
  location.replace('login.html');
}
