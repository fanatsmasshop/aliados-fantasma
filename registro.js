import { supabase } from './supabase-client.js?v=20260724-RC1';
import { isConfigured } from './config.js?v=20260717-2';
import { isStrongPassword, passwordStrength, PASSWORD_HELP } from './auth-validation.js?v=20260730-F1FIX';
import { populateStateSelect } from './mexico-geo.js?v=20260814-NACIONAL1';

const form=document.querySelector('#register-form');
const button=document.querySelector('#register-button');
const message=document.querySelector('#register-message');
const warning=document.querySelector('#config-warning');
const password=document.querySelector('#password');
const confirm=document.querySelector('#password-confirm');
const DRAFT_KEY='af_registro_borrador_rc1';
let step=1;
let submitting=false;

const fields={responsable:'#responsable',email:'#email',password:'#password','password-confirm':'#password-confirm',negocio:'#negocio',categoria:'#categoria',whatsapp:'#whatsapp',estado_region:'#estado_region',municipio:'#municipio',colonia:'#colonia',terms:'#terms'};
const el=id=>document.querySelector(fields[id]);
const val=id=>el(id)?.value.trim()||'';

populateStateSelect(document.querySelector('#estado_region'));

if(!isConfigured||!supabase){warning?.classList.remove('hidden');if(button)button.disabled=true;}

function setButtonText(text){const span=button?.querySelector('span');if(span)span.textContent=text;}
function setError(id,text=''){const out=document.querySelector(`[data-error-for="${id}"]`);if(out)out.textContent=text;const input=el(id);if(input)input.setAttribute('aria-invalid',text?'true':'false');}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function digits(v){return String(v).replace(/\D/g,'');}
function validPhone(v){return digits(v).length===10||digits(v).length===12&&digits(v).startsWith('52');}
function updateStrength(){const strength=passwordStrength(password?.value||'');const fill=document.querySelector('#password-meter-fill');const label=document.querySelector('#password-strength');if(fill)fill.style.width=`${strength.score*20}%`;if(label){label.textContent=strength.label;label.style.color=strength.valid?'var(--success)':strength.score>=3?'#ffd36b':'var(--danger)';}}
password?.addEventListener('input',updateStrength);

document.querySelector('#toggle-password')?.addEventListener('click',event=>{const show=password.type==='password';password.type=confirm.type=show?'text':'password';event.currentTarget.textContent=show?'Ocultar':'Ver';});

function validateStep(n){let ok=true;const req=(id,msg)=>{setError(id,'');if(!val(id)){setError(id,msg);ok=false;}};
  if(n===1){req('responsable','Escribe tu nombre.');req('email','Escribe tu correo.');if(val('email')&&!validEmail(val('email'))){setError('email','Escribe un correo válido.');ok=false;}setError('password','');if(!isStrongPassword(password.value)){setError('password',PASSWORD_HELP);ok=false;}setError('password-confirm','');if(password.value!==confirm.value){setError('password-confirm','Las contraseñas no coinciden.');ok=false;}}
  if(n===2){['negocio','categoria','estado_region','municipio','colonia'].forEach(id=>req(id,'Este campo es obligatorio.'));req('whatsapp','Escribe tu WhatsApp.');if(val('whatsapp')&&!validPhone(val('whatsapp'))){setError('whatsapp','Escribe un número mexicano de 10 dígitos.');ok=false;}}
  if(n===3){setError('terms','');if(!el('terms')?.checked){setError('terms','Debes aceptar los términos y el aviso de privacidad.');ok=false;}}
  return ok;
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function renderSummary(){const out=document.querySelector('#register-summary');if(!out)return;out.innerHTML=[['Responsable',val('responsable')],['Correo',val('email')],['Negocio',val('negocio')],['Categoría',val('categoria')],['WhatsApp',val('whatsapp')],['Estado',val('estado_region')],['Zona',`${val('colonia')}, ${val('municipio')}, ${val('estado_region')}`]].map(([a,b])=>`<div class="summary-row"><span>${a}</span><strong>${escapeHtml(b)}</strong></div>`).join('');}
function go(n){step=n;document.querySelectorAll('.form-step').forEach(x=>x.classList.toggle('active',Number(x.dataset.step)===n));document.querySelectorAll('.auth-step').forEach(x=>{const k=Number(x.dataset.progress);x.classList.toggle('active',k===n);x.classList.toggle('done',k<n);});const titles={1:['Datos de acceso','Comienza con tu nombre, correo y contraseña.'],2:['Información del negocio','Cuéntanos lo básico para revisar tu solicitud.'],3:['Confirma tu información','Revisa tus datos antes de crear la cuenta.']};document.querySelector('#step-title').textContent=titles[n][0];document.querySelector('#step-subtitle').textContent=titles[n][1];if(n===3)renderSummary();window.scrollTo({top:0,behavior:'smooth'});}
function saveDraft(){const data={};['responsable','email','negocio','categoria','whatsapp','estado_region','municipio','colonia'].forEach(id=>data[id]=val(id));localStorage.setItem(DRAFT_KEY,JSON.stringify(data));}
function restoreDraft(){try{const data=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');Object.entries(data).forEach(([id,value])=>{const input=el(id);if(input&&value)input.value=value;});}catch{} }
restoreDraft();
form?.addEventListener('input',saveDraft);
document.querySelectorAll('[data-next]').forEach(x=>x.addEventListener('click',()=>{if(validateStep(step)){saveDraft();go(step+1);}}));
document.querySelectorAll('[data-prev]').forEach(x=>x.addEventListener('click',()=>go(step-1)));

form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(submitting||!validateStep(3)||!supabase)return;
  submitting=true;message.textContent='';button.disabled=true;setButtonText('Creando cuenta…');
  try{
    const email=val('email').toLowerCase();
    const redirect=new URL('verificar-correo.html',document.baseURI).href;
    const phone=digits(val('whatsapp')).replace(/^52(?=\d{10}$)/,'');
    const {data,error}=await supabase.auth.signUp({
      email,
      password:password.value,
      options:{
        emailRedirectTo:redirect,
        data:{
          tipo_registro:'pre_registro_negocio',
          nombre_responsable:val('responsable'),
          nombre_negocio:val('negocio'),
          categoria:val('categoria'),
          whatsapp:phone,
          estado_region:val('estado_region'),
          pais:'México',
          municipio:val('municipio'),
          colonia:val('colonia')
        }
      }
    });
    if(error)throw error;
    sessionStorage.setItem('af_prereg_email',email);
    localStorage.removeItem(DRAFT_KEY);
    if(data?.session){
      try{await supabase.rpc('usuario_sincronizar_mi_pre_registro');}catch(syncError){console.warn('Sincronización diferida:',syncError);}
      location.replace('estado-cuenta.html');
    }else{
      location.replace('registro-enviado.html');
    }
  }catch(error){
    console.error(error);
    const raw=(error.message||'').toLowerCase();
    message.textContent=raw.includes('rate limit')||raw.includes('security purposes')?'Se hicieron demasiados intentos. Espera unos minutos antes de volver a intentar.':raw.includes('already')||raw.includes('registered')||raw.includes('exists')?'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.':raw.includes('password')?'La contraseña no cumple los requisitos de seguridad.':'No pudimos crear la cuenta. Revisa tu conexión e inténtalo de nuevo.';
  }finally{submitting=false;button.disabled=false;setButtonText('Crear mi cuenta');}
});
