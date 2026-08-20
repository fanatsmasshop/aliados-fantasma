import { supabase } from './supabase-client.js?v=20260720-600';

const VAPID_PUBLIC_KEY = 'BHOdSc0bBymuZ2TqFMbx0VenfJLlh6RCwZC-MWGIFix8ERI1FEdlKWU_fDjZG_poSKqdYD1WasbBD9J90qNkK5s';
const SW_URL = '/af-sw.js?v=20260819-PUSH1';
const UI_ID = 'af-push-control';
let currentSubscription = null;

function base64ToUint8Array(value){
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

function platformLabel(){
  const ua=navigator.userAgent||'';
  if(/Android/i.test(ua)) return 'Android';
  if(/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if(/Windows/i.test(ua)) return 'Windows';
  if(/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  return 'Web';
}

function injectStyles(){
  if(document.querySelector('#af-push-style')) return;
  const style=document.createElement('style');
  style.id='af-push-style';
  style.textContent=`
  #${UI_ID}{position:fixed;left:16px;right:16px;bottom:max(16px,env(safe-area-inset-bottom));z-index:99999;display:flex;align-items:center;gap:12px;max-width:560px;margin:auto;padding:13px 14px;border:1px solid rgba(123,231,255,.24);border-radius:18px;background:rgba(8,11,18,.96);box-shadow:0 18px 60px rgba(0,0,0,.45);backdrop-filter:blur(18px);font-family:inherit;color:#fff}
  #${UI_ID}[data-state="active"]{border-color:rgba(73,226,163,.28)}
  #${UI_ID} .af-push-icon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;font-size:22px;background:linear-gradient(135deg,rgba(72,207,255,.17),rgba(170,72,255,.16));flex:0 0 auto}
  #${UI_ID} .af-push-copy{min-width:0;flex:1}
  #${UI_ID} strong{display:block;font-size:14px;line-height:1.2;margin-bottom:3px}
  #${UI_ID} small{display:block;color:#a9b3c5;font-size:12px;line-height:1.35}
  #${UI_ID} button{border:0;border-radius:12px;padding:10px 13px;background:linear-gradient(135deg,#a83df0,#347dff);color:#fff;font-weight:800;font-size:12px;white-space:nowrap;cursor:pointer}
  #${UI_ID} button.secondary{background:#171b25;border:1px solid rgba(255,255,255,.1)}
  #${UI_ID} button:disabled{opacity:.6;cursor:wait}
  #${UI_ID} .af-push-close{position:absolute;right:7px;top:5px;width:24px;height:24px;padding:0;border-radius:9px;background:transparent;color:#8892a5;font-size:17px}
  @media(min-width:760px){#${UI_ID}{left:auto;right:20px;max-width:520px;margin:0}}
  `;
  document.head.appendChild(style);
}

function renderControl(state='offer',message='Activa alertas para recibir oportunidades aunque Aliados esté cerrado.'){
  injectStyles();
  let box=document.getElementById(UI_ID);
  if(!box){box=document.createElement('div');box.id=UI_ID;document.body.appendChild(box);}
  box.dataset.state=state;
  const active=state==='active';
  const denied=state==='denied';
  box.innerHTML=`
    <div class="af-push-icon">${active?'✅':denied?'🔕':'🔔'}</div>
    <div class="af-push-copy"><strong>${active?'Alertas activas en este dispositivo':denied?'Notificaciones bloqueadas':'Que Aliados te avise de inmediato'}</strong><small>${message}</small></div>
    ${active?'<button type="button" class="secondary" data-af-push-test>Listo</button>':denied?'<button type="button" class="secondary" data-af-push-help>Cómo activarlas</button>':'<button type="button" data-af-push-enable>Activar alertas</button>'}
    <button type="button" class="af-push-close" data-af-push-close aria-label="Cerrar">×</button>`;
  box.querySelector('[data-af-push-enable]')?.addEventListener('click',enablePush);
  box.querySelector('[data-af-push-close]')?.addEventListener('click',()=>box.remove());
  box.querySelector('[data-af-push-test]')?.addEventListener('click',()=>box.remove());
  box.querySelector('[data-af-push-help]')?.addEventListener('click',()=>{
    alert('En Chrome: abre los ajustes del sitio de Aliados Fantasma, entra a Notificaciones y selecciona Permitir. Después recarga esta página.');
  });
}

async function saveSubscription(subscription){
  const json=subscription.toJSON();
  const keys=json.keys||{};
  if(!json.endpoint||!keys.p256dh||!keys.auth) throw new Error('El navegador no entregó una suscripción válida.');
  const {error}=await supabase.rpc('af_registrar_push',{
    p_endpoint:json.endpoint,
    p_p256dh:keys.p256dh,
    p_auth:keys.auth,
    p_user_agent:navigator.userAgent||null,
    p_plataforma:platformLabel()
  });
  if(error) throw error;
}

async function enablePush(event){
  const button=event?.currentTarget;
  if(button){button.disabled=true;button.textContent='Activando…';}
  try{
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)) throw new Error('Este navegador no admite notificaciones web.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      renderControl('denied','Chrome tiene bloqueados los avisos. Debes permitir Notificaciones para este sitio.');
      return;
    }
    const registration=await navigator.serviceWorker.register(SW_URL,{scope:'/'});
    await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8Array(VAPID_PUBLIC_KEY)});
    }
    await saveSubscription(subscription);
    currentSubscription=subscription;
    renderControl('active','Las nuevas solicitudes pueden aparecer como notificación del sistema.');
  }catch(error){
    console.error('[Aliados Push]',error);
    renderControl('offer',`No se pudo activar: ${error?.message||'intenta de nuevo'}`);
  }
}

async function initPush(){
  try{
    if(!supabase||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)) return;
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return;
    const registration=await navigator.serviceWorker.register(SW_URL,{scope:'/'});
    await navigator.serviceWorker.ready;
    currentSubscription=await registration.pushManager.getSubscription();
    if(currentSubscription&&Notification.permission==='granted'){
      await saveSubscription(currentSubscription);
      renderControl('active','Este dispositivo ya está registrado para recibir avisos de Aliados.');
      setTimeout(()=>document.getElementById(UI_ID)?.remove(),5500);
      return;
    }
    if(Notification.permission==='denied'){
      renderControl('denied','Chrome tiene bloqueadas las notificaciones de Aliados en este dispositivo.');
      return;
    }
    renderControl('offer');
  }catch(error){
    console.warn('[Aliados Push] No se pudo inicializar',error);
  }
}

// ============================================================
// HOTFIX: ENVÍO DE PERFIL A REVISIÓN
// El panel antiguo usa un flujo modal/upsert que puede quedar colgado.
// Este controlador reemplaza SOLO el botón de envío y verifica el resultado.
// ============================================================
function reviewMessage(text,type='ok'){
  const help=document.querySelector('#submit-help');
  if(help){
    help.textContent=text;
    help.style.color=type==='error'?'#fda4af':'#86efac';
    help.style.fontWeight='700';
  }
  const global=document.querySelector('#global-message');
  if(global){
    global.textContent=text;
    global.className=`notice ${type==='error'?'danger':'success'}`;
  }
}

async function submitProfileDirectly(){
  const button=document.querySelector('#submit-review');
  if(!button||!supabase) return;
  const original=button.textContent;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) throw new Error('Tu sesión terminó. Inicia sesión nuevamente.');

    const {data:row,error:readError}=await supabase
      .from('perfiles_borrador')
      .select('usuario_id,estado,porcentaje,enviado_at')
      .eq('usuario_id',user.id)
      .maybeSingle();
    if(readError) throw readError;
    if(!row) throw new Error('Primero guarda tu perfil antes de enviarlo.');
    if(Number(row.porcentaje||0)<60) throw new Error('Completa al menos 60% del perfil antes de enviarlo.');
    if(row.estado==='en_revision'){
      reviewMessage('Tu perfil ya está en revisión.');
      button.textContent='Perfil enviado';
      button.disabled=true;
      return;
    }

    if(!window.confirm('¿Enviar esta versión de tu perfil a revisión? Mientras se revisa podrás consultar la vista previa.')) return;

    button.disabled=true;
    button.textContent='Enviando…';
    reviewMessage('Enviando tu perfil…');
    const now=new Date().toISOString();
    const {data:updated,error:updateError}=await supabase
      .from('perfiles_borrador')
      .update({estado:'en_revision',enviado_at:now,updated_at:now})
      .eq('usuario_id',user.id)
      .select('estado,enviado_at,porcentaje')
      .single();
    if(updateError) throw updateError;
    if(updated?.estado!=='en_revision'||!updated?.enviado_at) throw new Error('Supabase no confirmó el envío.');

    document.querySelectorAll('#review-summary .review-card').forEach(card=>{
      if(card.querySelector('span')?.textContent?.trim()==='Estado'){
        const strong=card.querySelector('strong');
        if(strong) strong.textContent='En revisión';
      }
    });
    button.textContent='Perfil enviado';
    button.disabled=true;
    reviewMessage('✓ Perfil enviado correctamente. Ya está en revisión.');
    setTimeout(()=>location.reload(),900);
  }catch(error){
    console.error('[Aliados revisión]',error);
    button.disabled=false;
    button.textContent=original;
    reviewMessage(`No se pudo enviar: ${error?.message||'intenta de nuevo'}`,'error');
  }
}

function installReviewHotfix(){
  const button=document.querySelector('#submit-review');
  if(!button||button.dataset.reviewHotfix==='1') return;
  button.dataset.reviewHotfix='1';
  // panel.js asigna su handler con .onclick; lo reemplazamos de forma explícita.
  button.onclick=submitProfileDirectly;
}

async function boot(){
  await initPush();
  // panel.js es otro módulo; damos tiempo a que termine su inicialización y después
  // imponemos el controlador robusto. También observamos por si el panel se rerenderiza.
  setTimeout(installReviewHotfix,600);
  setTimeout(installReviewHotfix,1800);
  const observer=new MutationObserver(()=>installReviewHotfix());
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
