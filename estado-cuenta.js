import { supabase } from './supabase-client.js?v=20260718-110';

const loading = document.querySelector('#state-loading');
const content = document.querySelector('#state-content');
const errorBox = document.querySelector('#state-error');

function fail(text) {
  loading.classList.add('hidden');
  document.querySelector('#state-error-text').textContent = text;
  errorBox.classList.remove('hidden');
}

const { data: { user }, error: userError } = await supabase.auth.getUser();
if (userError || !user) {
  location.replace('login.html');
} else {
  const { data: row, error: rowError } = await supabase.from('pre_registros').select('*').eq('id', user.id).maybeSingle();
  if (rowError || !row) {
    fail('No encontramos el pre-registro asociado. Contacta al equipo de Aliados Fantasma.');
  } else {
    loading.classList.add('hidden');
    content.classList.remove('hidden');
    document.querySelector('#state-business').textContent = row.nombre_negocio || 'Tu negocio';
    document.querySelector('#state-email').textContent = row.correo;
    document.querySelector('#state-verified').innerHTML = row.correo_verificado
      ? '<span class="status-pill ok">✓ Verificado</span>'
      : '<span class="status-pill pending">Pendiente</span>';

    const labels = {
      pendiente: 'Pendiente de revisión',
      contactado: 'En seguimiento',
      aprobado: 'Pre-registro aprobado',
      rechazado: 'Pre-registro no aprobado'
    };
    document.querySelector('#state-status').textContent = labels[row.estado] || row.estado;
    document.querySelector('#state-date').textContent = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(row.created_at));

    const notes = {
      pendiente: 'Recibimos tu pre-registro. El equipo revisará la información y podrás consultar aquí cualquier cambio.',
      contactado: 'El equipo ya comenzó a dar seguimiento. Mantente pendiente de tu WhatsApp o correo.',
      aprobado: 'Tu pre-registro fue aprobado. Conservaremos tus datos y nos pondremos en contacto contigo para continuar cuando inicie la siguiente etapa de Aliados Fantasma.',
      rechazado: 'Tu pre-registro no fue aprobado por ahora. Puedes contactar al equipo para solicitar más información.'
    };
    document.querySelector('#state-note').textContent = notes[row.estado] || '';
  }
}

document.querySelector('#state-logout')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.replace('login.html');
});
