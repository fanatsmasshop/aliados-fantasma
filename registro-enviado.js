import { supabase } from './supabase-client.js?v=20260724-RC1';

const email=sessionStorage.getItem('af_prereg_email')||'';
const emailOut=document.querySelector('#sent-email');
const button=document.querySelector('#resend-button');
const msg=document.querySelector('#resend-message');
const count=document.querySelector('#resend-countdown');
let seconds=45;
let timer=null;

if(emailOut)emailOut.textContent=email||'el correo registrado';
function setText(text){const span=button?.querySelector('span');if(span)span.textContent=text;}
function tick(){if(button)button.disabled=seconds>0;if(count)count.textContent=seconds>0?`Podrás reenviar en ${seconds} segundos.`:'';seconds-=1;if(seconds<0&&timer){clearInterval(timer);timer=null;}}
function start(){if(timer)clearInterval(timer);seconds=45;tick();timer=setInterval(tick,1000);}
start();

button?.addEventListener('click',async()=>{
  if(!email||!supabase)return;
  button.disabled=true;setText('Enviando…');if(msg)msg.textContent='';
  try{
    const emailRedirectTo=new URL('verificar-correo.html',document.baseURI).href;
    const {error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo}});
    if(error)throw error;
    if(msg){msg.style.color='var(--success)';msg.textContent='Correo reenviado. Revisa también Spam, Promociones y correo no deseado.';}
    start();
  }catch(error){
    console.error(error);
    if(msg){msg.style.color='var(--danger)';msg.textContent='No pudimos reenviarlo todavía. Espera unos minutos e inténtalo de nuevo.';}
  }finally{setText('Reenviar correo');}
});
