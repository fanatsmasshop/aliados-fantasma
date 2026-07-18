import { supabase } from './supabase-client.js?v=20260717-2';
import { isConfigured } from './config.js?v=20260717-2';

const form = document.querySelector('#register-form');
const button = document.querySelector('#register-button');
const message = document.querySelector('#register-message');
const warning = document.querySelector('#config-warning');
const password = document.querySelector('#password');
const passwordConfirm = document.querySelector('#password-confirm');

if (!isConfigured || !supabase) {
  warning.classList.remove('hidden');
  button.disabled = true;
}

document.querySelector('#toggle-password').addEventListener('click', () => {
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  passwordConfirm.type = visible ? 'password' : 'text';
  document.querySelector('#toggle-password').textContent = visible ? 'Ver' : 'Ocultar';
});

function value(id) {
  return document.querySelector(id).value.trim();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  if (password.value !== passwordConfirm.value) {
    message.textContent = 'Las contraseñas no coinciden.';
    passwordConfirm.focus();
    return;
  }

  if (password.value.length < 8) {
    message.textContent = 'La contraseña debe tener al menos 8 caracteres.';
    password.focus();
    return;
  }

  button.disabled = true;
  button.querySelector('span').textContent = 'Registrando…';

  try {
    const redirectUrl = new URL('verificar-correo.html', window.location.href).href;
    const { error } = await supabase.auth.signUp({
      email: value('#email').toLowerCase(),
      password: password.value,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          tipo_registro: 'pre_registro_negocio',
          nombre_responsable: value('#responsable'),
          nombre_negocio: value('#negocio'),
          categoria: value('#categoria'),
          whatsapp: value('#whatsapp'),
          municipio: value('#municipio'),
          colonia: value('#colonia')
        }
      }
    });

    if (error) throw error;

    sessionStorage.setItem('af_prereg_email', value('#email').toLowerCase());
    location.href = 'registro-enviado.html';
  } catch (error) {
    console.error(error);
    const raw = (error.message || '').toLowerCase();
    message.textContent = raw.includes('rate limit')
      ? 'Se hicieron demasiados intentos. Espera unos minutos y vuelve a probar.'
      : raw.includes('password')
        ? 'La contraseña no cumple los requisitos de seguridad.'
        : 'No fue posible completar el pre-registro. Revisa tus datos o intenta con otro correo.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Enviar pre-registro';
  }
});
