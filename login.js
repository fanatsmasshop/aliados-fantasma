import { supabase } from './supabase-client.js?v=20260717-2';
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

document.querySelector('#toggle-password').addEventListener('click', () => {
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  document.querySelector('#toggle-password').textContent = visible ? 'Ver' : 'Ocultar';
});

async function redirectByRole(user) {
  const { data: profile, error } = await supabase
    .from('perfiles')
    .select('rol,activo,estado')
    .eq('id', user.id)
    .maybeSingle();

  if (!error && profile?.rol === 'administrador' && profile?.activo === true) {
    location.replace('dashboard.html');
    return true;
  }

  await supabase.auth.signOut();
  message.textContent = 'Tu correo ya está verificado, pero el acceso al panel sigue pendiente de aprobación.';
  return false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  button.disabled = true;
  button.querySelector('span').textContent = 'Verificando…';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    });

    if (error) {
      message.textContent = error.message?.toLowerCase().includes('email not confirmed')
        ? 'Primero confirma tu correo desde el mensaje que te enviamos.'
        : 'No fue posible iniciar sesión. Revisa el correo y la contraseña.';
      return;
    }

    await redirectByRole(data.user);
  } catch (error) {
    console.error(error);
    message.textContent = 'No fue posible conectar con el servicio de acceso.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Entrar al panel';
  }
});
