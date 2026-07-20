import { supabase } from './supabase-client.js?v=20260720-410';

const loading = document.querySelector('#state-loading');
const content = document.querySelector('#state-content');
const errorBox = document.querySelector('#state-error');

function fail(text){
  loading?.classList.add('hidden');
  const errorText = document.querySelector('#state-error-text');
  if(errorText) errorText.textContent = text;
  errorBox?.classList.remove('hidden');
}

function renderPreRegistration(row){
  loading?.classList.add('hidden');
  errorBox?.classList.add('hidden');
  content?.classList.remove('hidden');
  document.querySelector('#state-business').textContent = row.nombre_negocio || 'Tu negocio';
  document.querySelector('#state-email').textContent = row.correo || 'Correo no disponible';
  document.querySelector('#state-verified').innerHTML = row.correo_verificado ? '<span class="status-pill ok">✓ Verificado</span>' : '<span class="status-pill pending">Pendiente</span>';
  const labels = {pendiente:'Pendiente de revisión',contactado:'En seguimiento',aprobado:'Pre-registro aprobado',rechazado:'Pre-registro no aprobado'};
  document.querySelector('#state-status').textContent = labels[row.estado] || row.estado || 'Pendiente';
  const createdAt = row.created_at ? new Date(row.created_at) : null;
  document.querySelector('#state-date').textContent = createdAt && !Number.isNaN(createdAt.getTime()) ? new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(createdAt) : 'Fecha no disponible';
  const notes = {
    pendiente:'Recibimos tu pre-registro. Puedes comenzar a preparar tu perfil mientras el equipo revisa tu solicitud.',
    contactado:'El equipo ya comenzó a dar seguimiento. También puedes continuar preparando tu perfil digital.',
    aprobado:'Tu pre-registro fue aprobado. Entra al Centro de Configuración para completar y enviar tu perfil.',
    rechazado:'Tu pre-registro no fue aprobado por ahora. Puedes contactar al equipo para solicitar más información.'
  };
  document.querySelector('#state-note').textContent = notes[row.estado] || 'Tu solicitud está registrada.';
}

function renderProfileState(draft){
  const card = document.querySelector('#profile-state-card');
  const label = document.querySelector('#profile-state-label');
  const note = document.querySelector('#profile-state-note');
  const action = document.querySelector('#profile-action');
  card.classList.remove('hidden');
  const states = {
    borrador:['Borrador','Tu perfil todavía no se ha enviado. Continúa completándolo y guárdalo.','Continuar configurando'],
    en_revision:['En revisión','El equipo recibió tu perfil y está revisándolo. La respuesta aparecerá en tu Centro de Configuración.','Consultar revisión'],
    cambios_solicitados:['Cambios solicitados','El administrador dejó observaciones. Corrige la información y vuelve a enviarla.','Ver correcciones'],
    aprobado:['Aprobado · en espera','Tu perfil está listo, pero permanecerá privado hasta el lanzamiento oficial.','Ver confirmación'],
    publicado:['Publicado','Tu negocio ya cuenta con un perfil aprobado en la plataforma.','Administrar perfil'],
    rechazado:['No aprobado','Revisa el motivo y presenta una versión corregida cuando esté lista.','Corregir perfil']
  };
  const meta = states[draft?.estado] || ['Sin iniciar','Todavía no has comenzado a configurar tu perfil digital.','Configurar mi perfil'];
  label.textContent = meta[0];
  note.textContent = meta[1];
  action.textContent = meta[2];
}

async function loadState(){
  try{
    const {data:{user},error:userError} = await supabase.auth.getUser();
    if(userError || !user){ location.replace('login.html'); return; }
    const [{data:preData,error:preError},{data:draftData,error:draftError}] = await Promise.all([
      supabase.rpc('usuario_obtener_mi_pre_registro'),
      supabase.from('perfiles_borrador').select('estado,porcentaje,comentario_administrador,negocio_id,revisado_at').eq('usuario_id',user.id).maybeSingle()
    ]);
    if(preError) throw preError;
    if(draftError) throw draftError;
    const row = Array.isArray(preData) ? preData[0] : preData;
    if(!row){ fail('No encontramos un pre-registro asociado a este correo. Verifica que hayas iniciado sesión con la misma cuenta utilizada para registrar el negocio.'); return; }
    renderPreRegistration(row);
    renderProfileState(draftData);
  }catch(error){
    console.error('Error al consultar el estado:',error);
    fail('No pudimos consultar tu solicitud en este momento. Actualiza la página; si continúa, contacta al equipo de Aliados Fantasma.');
  }
}

await loadState();
document.querySelector('#state-logout')?.addEventListener('click',async()=>{ await supabase.auth.signOut(); location.replace('login.html'); });
