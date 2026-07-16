export const $=(s,r=document)=>r.querySelector(s);
export function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
export function slugify(v=''){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
export function fmt(v){return v?new Intl.DateTimeFormat('es-MX',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Sin fecha';}
export function toast(m,t='success'){let b=$('#toast-box');if(!b){b=document.createElement('div');b.id='toast-box';b.className='toast-box';document.body.appendChild(b)}const e=document.createElement('div');e.className='toast '+t;e.textContent=m;b.appendChild(e);setTimeout(()=>e.remove(),3000)}
export function shell(profile,user){$('#user-name')&&($('#user-name').textContent=profile.nombre||'Administrador');$('#user-email')&&($('#user-email').textContent=user.email||'');$('#user-initial')&&($('#user-initial').textContent=(profile.nombre||'A').charAt(0).toUpperCase());$('#menu-button')?.addEventListener('click',()=>{$('#sidebar').classList.add('open');$('#overlay').classList.remove('hidden')});$('#overlay')?.addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#overlay').classList.add('hidden')})}
export function openModal(id){$(id).classList.remove('hidden');document.body.classList.add('modal-open')}
export function closeModal(id){$(id).classList.add('hidden');document.body.classList.remove('modal-open')}
