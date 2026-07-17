import { supabase } from './supabase-client.js?v=20260717-1';
import { isConfigured } from './config.js?v=20260717-1';

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
  if (data.session) location.replace('dashboard.html');
}

document.querySelector('#toggle-password').addEventListener('click', () => {
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  document.querySelector('#toggle-password').textContent = visible ? 'Ver' : 'Ocultar';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  button.disabled = true;
  button.querySelector('span').textContent = 'Verificando…';

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    });

    if (error) {
      message.textContent = 'No fue posible iniciar sesión. Revisa el correo y la contraseña.';
      return;
    }
    location.replace('dashboard.html');
  } catch (error) {
    console.error(error);
    message.textContent = 'No fue posible conectar con el servicio de acceso.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Entrar al panel';
  }
});
