import { supabase } from './supabase-client.js?v=20260724-RC1';

const loading=document.querySelector('#state-loading');
const content=document.querySelector('#state-content');
const errorBox=document.querySelector('#state-error');
const action=document.querySelector('#profile-action');

function fail(text){loading?.classList.add('hidden');const out=document.querySelector('#state-error-text');if(out)out.textContent=text;errorBox?.classList.remove('hidden');}
function configureAction(row,draft){
  if(!action)return;
  const blocked=!row.correo_verificado||row.estado==='rechazado';
  action.classList.toggle('disabled',blocked);
  action.setAttribute('aria-disabled',blocked?'true':'false');
  action.href=blocked?'#':'panel.html';
  if(blocked){action.onclick=event=>event.preventDefault();action.textContent=!row.correo_verificado?'Verifica tu correo para continuar':'Registro no habilitado';}
  else if(!draft){action.textContent=row.estado==='aprobado'?'Completar perfil del negocio':'Preparar mi perfil';}
}
function renderPreRegistration(row){
  loading?.classList.add('hidden');errorBox?.classList.add('hidden');content?.classList.remove('hidden');
  document.querySelector('#state-business').textContent=row.nombre_negocio||'Tu negocio';
  document.querySelector('#state-email').textContent=row.correo||'Correo no disponible';
  document.querySelector('#state-verified').innerHTML=row.correo_verificado?'<span class="status-pill ok">✓ Verificado</span>':'<span class="status-pill pending">Pendiente</span>';
  const labels={pendiente:'Pendiente de revisión',contactado:'En seguimiento',aprobado:'Pre-registro aprobado',rechazado:'Pre-registro no aprobado'};
  document.querySelector('#state-status').textContent=labels[row.estado]||row.estado||'Pendiente';
  const createdAt=row.created_at?new Date(row.created_at):null;
  document.querySelector('#state-date').textContent=createdAt&&!Number.isNaN(createdAt.getTime())?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium'}).format(createdAt):'Fecha no disponible';
  const notes={pendiente:'Recibimos tu registro. Puedes preparar tu perfil mientras el equipo revisa la solicitud.',contactado:'El equipo ya comenzó a dar seguimiento. Puedes continuar preparando el perfil digital.',aprobado:'Tu registro fue aprobado. Completa y envía el perfil de tu negocio para revisión.',rechazado:'Tu registro no fue aprobado por ahora. Contacta al equipo para solicitar más información.'};
  document.querySelector('#state-note').textContent=notes[row.estado]||'Tu solicitud está registrada.';
}
function renderProfileState(draft){
  const card=document.querySelector('#profile-state-card');const label=document.querySelector('#profile-state-label');const note=document.querySelector('#profile-state-note');
  card?.classList.remove('hidden');
  const states={borrador:['Borrador','Tu perfil todavía no se ha enviado. Continúa completándolo y guárdalo.','Continuar configurando'],en_revision:['En revisión','El equipo recibió tu perfil y está revisándolo.','Consultar revisión'],cambios_solicitados:['Cambios solicitados','Corrige las observaciones y vuelve a enviarlo.','Ver correcciones'],aprobado:['Aprobado · en espera','Tu perfil está listo y permanece reservado para el lanzamiento.','Ver confirmación'],publicado:['Publicado','Tu negocio ya cuenta con un perfil publicado.','Administrar perfil'],rechazado:['No aprobado','Revisa el motivo y presenta una versión corregida.','Corregir perfil']};
  const meta=states[draft?.estado]||['Sin iniciar','Todavía no has comenzado a configurar tu perfil digital.','Configurar mi perfil'];
  if(label)label.textContent=meta[0];if(note)note.textContent=meta[1];if(action&&action.getAttribute('aria-disabled')!=='true')action.textContent=meta[2];
}
async function loadState(){
  try{
    if(!supabase)throw new Error('El servicio de acceso no está configurado.');
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user){location.replace('login.html');return;}
    const {error:syncError}=await supabase.rpc('usuario_sincronizar_mi_pre_registro');
    if(syncError)console.warn('No fue posible ejecutar la reparación automática:',syncError);
    const [{data:preData,error:preError},{data:draftData,error:draftError}]=await Promise.all([
      supabase.rpc('usuario_obtener_mi_pre_registro'),
      supabase.from('perfiles_borrador').select('estado,porcentaje,comentario_administrador,negocio_id,revisado_at').eq('usuario_id',user.id).maybeSingle()
    ]);
    if(preError)throw preError;if(draftError)throw draftError;
    const row=Array.isArray(preData)?preData[0]:preData;
    if(!row){fail('No encontramos el registro asociado a esta cuenta. Vuelve a iniciar sesión; si continúa, contacta al equipo de Aliados Fantasma.');return;}
    renderPreRegistration(row);configureAction(row,draftData);renderProfileState(draftData);
  }catch(error){console.error('Error al consultar el estado:',error);fail('No pudimos consultar tu solicitud. Actualiza la página; si continúa, contacta al equipo de Aliados Fantasma.');}
}
await loadState();
document.querySelector('#state-logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html');});
