import { supabase } from './supabase-client.js?v=20260718-130';

const loading = document.querySelector('#state-loading');
const content = document.querySelector('#state-content');
const errorBox = document.querySelector('#state-error');

function fail(text) {
  loading?.classList.add('hidden');
  const errorText = document.querySelector('#state-error-text');
  if (errorText) errorText.textContent = text;
  errorBox?.classList.remove('hidden');
}

function render(row) {
  loading?.classList.add('hidden');
  errorBox?.classList.add('hidden');
  content?.classList.remove('hidden');

  document.querySelector('#state-business').textContent = row.nombre_negocio || 'Tu negocio';
  document.querySelector('#state-email').textContent = row.correo || 'Correo no disponible';
  document.querySelector('#state-verified').innerHTML = row.correo_verificado
    ? '<span class="status-pill ok">✓ Verificado</span>'
    : '<span class="status-pill pending">Pendiente</span>';

  const labels = {
    pendiente: 'Pendiente de revisión',
    contactado: 'En seguimiento',
    aprobado: 'Pre-registro aprobado',
    rechazado: 'Pre-registro no aprobado'
  };
  document.querySelector('#state-status').textContent = labels[row.estado] || row.estado || 'Pendiente';

  const createdAt = row.created_at ? new Date(row.created_at) : null;
  document.querySelector('#state-date').textContent = createdAt && !Number.isNaN(createdAt.getTime())
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(createdAt)
    : 'Fecha no disponible';

  const notes = {
    pendiente: 'Recibimos tu pre-registro. El equipo revisará la información y podrás consultar aquí cualquier cambio.',
    contactado: 'El equipo ya comenzó a dar seguimiento. Mantente pendiente de tu WhatsApp o correo.',
    aprobado: 'Tu pre-registro fue aprobado. Conservaremos tus datos y nos pondremos en contacto contigo para continuar cuando inicie la siguiente etapa de Aliados Fantasma.',
    rechazado: 'Tu pre-registro no fue aprobado por ahora. Puedes contactar al equipo para solicitar más información.'
  };
  document.querySelector('#state-note').textContent = notes[row.estado] || 'Tu solicitud está registrada.';
}

async function loadState() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      location.replace('login.html');
      return;
    }

    const { data, error } = await supabase.rpc('usuario_obtener_mi_pre_registro');
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      fail('No encontramos un pre-registro asociado a este correo. Verifica que hayas iniciado sesión con la misma cuenta que utilizaste para registrar LN Studio.');
      return;
    }

    render(row);
  } catch (error) {
    console.error('Error al consultar el estado:', error);
    fail('No pudimos consultar tu solicitud en este momento. Actualiza la página; si continúa, contacta al equipo de Aliados Fantasma.');
  }
}

await loadState();

document.querySelector('#state-logout')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.replace('login.html');
});
