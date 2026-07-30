import { supabase } from './supabase-client.js?v=20260717-2';
import { isStrongPassword, PASSWORD_HELP } from './auth-validation.js?v=20260730-F1FIX';

const form = document.querySelector('#password-form');
const invalid = document.querySelector('#recovery-invalid');
const password = document.querySelector('#password');
const confirm = document.querySelector('#password-confirm');
const button = document.querySelector('#password-button');
const message = document.querySelector('#password-message');
let recovery = false;

const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('error_description')) invalid?.classList.remove('hidden');

const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    recovery = true;
    form?.classList.remove('hidden');
  }
});

const { data } = await supabase.auth.getSession();
if (data.session) {
  recovery = true;
  form?.classList.remove('hidden');
}

setTimeout(() => {
  if (!recovery) invalid?.classList.remove('hidden');
  listener.subscription.unsubscribe();
}, 6000);

form?.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';

  if (!isStrongPassword(password.value)) {
    message.textContent = PASSWORD_HELP;
    return;
  }
  if (password.value !== confirm.value) {
    message.textContent = 'Las contraseñas no coinciden.';
    return;
  }

  button.disabled = true;
  button.querySelector('span').textContent = 'Guardando…';
  try {
    const { error } = await supabase.auth.updateUser({ password: password.value });
    if (error) throw error;
    message.style.color = 'var(--success)';
    message.textContent = 'Contraseña actualizada correctamente. Te llevaremos al acceso.';
    await supabase.auth.signOut();
    setTimeout(() => location.replace('login.html'), 1500);
  } catch (error) {
    console.error(error);
    message.textContent = 'El enlace pudo caducar. Solicita uno nuevo.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Guardar contraseña';
  }
});
