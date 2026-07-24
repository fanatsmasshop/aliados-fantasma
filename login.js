import { supabase } from './supabase-client.js?v=20260718-110';
import { isConfigured } from './config.js?v=20260717-2';

const form = document.querySelector('#login-form');
const email = document.querySelector('#email');
const password = document.querySelector('#password');
const button = document.querySelector('#login-button');
const message = document.querySelector('#login-message');
const warning = document.querySelector('#config-warning');

if (!isConfigured || !supabase) {
  warning.classList.remove('hidden');
  button.disabled = true;
} else {
  const { data } = await supabase.auth.getSession();
  if (data.session) await redirectByRole(data.session.user);
}

document.querySelector('#toggle-password').addEventListener('click', event => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? 'Ocultar' : 'Ver';
});

async function redirectByRole(user) {
  const [{ data: profile }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from('perfiles').select('rol,activo').eq('id', user.id).maybeSingle(),
    supabase
      .from('miembros_negocio')
      .select('negocio_id,rol,activo')
      .eq('perfil_id', user.id)
      .eq('activo', true)
  ]);

  if (membershipError) console.warn('No se pudieron consultar los negocios asignados:', membershipError);

  if ((memberships || []).length > 0) {
    location.replace('panel.html');
    return;
  }

  if (profile?.rol === 'administrador' && profile?.activo === true) {
    location.replace('dashboard.html');
    return;
  }

  location.replace('panel.html');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';
  button.disabled = true;
  button.querySelector('span').textContent = 'Ingresando…';
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim().toLowerCase(),
      password: password.value
    });
    if (error) {
      const raw = (error.message || '').toLowerCase();
      message.textContent = raw.includes('email not confirmed')
        ? 'Debes verificar tu correo antes de entrar.'
        : raw.includes('invalid login')
          ? 'El correo o la contraseña son incorrectos.'
          : 'No pudimos iniciar sesión. Inténtalo nuevamente.';
      return;
    }
    await redirectByRole(data.user);
  } catch (error) {
    console.error(error);
    message.textContent = 'No fue posible conectar con el servicio de acceso.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Entrar';
  }
});
