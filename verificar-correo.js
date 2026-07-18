import { supabase } from './supabase-client.js?v=20260717-2';

const loading = document.querySelector('#verify-loading');
const success = document.querySelector('#verify-success');
const errorBox = document.querySelector('#verify-error');
const errorMessage = document.querySelector('#verify-message');

async function finish(ok, text = '') {
  loading.classList.add('hidden');
  if (ok) {
    success.classList.remove('hidden');
    await supabase.auth.signOut();
  } else {
    errorMessage.textContent = text || 'El enlace pudo caducar o ya fue utilizado.';
    errorBox.classList.remove('hidden');
  }
}

try {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user?.email_confirmed_at) {
    await finish(true);
  } else {
    let resolved = false;
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!resolved && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user?.email_confirmed_at) {
        resolved = true;
        listener.subscription.unsubscribe();
        await finish(true);
      }
    });
    setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        listener.subscription.unsubscribe();
        await finish(false);
      }
    }, 7000);
  }
} catch (error) {
  console.error(error);
  await finish(false, 'El enlace no es válido o ya expiró.');
}
