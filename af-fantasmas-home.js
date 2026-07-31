
document.addEventListener('DOMContentLoaded',()=>{
  const heroTitle=document.querySelector('.hero-copy h1');
  if(heroTitle && !heroTitle.classList.contains('fantasmas-upgraded')){
    heroTitle.classList.add('fantasmas-upgraded');
    heroTitle.innerHTML=`<span class="line">La red de negocios</span><span class="line">locales está</span><span class="word-slider" aria-label="por despertar, por conectar, por crecer"><span class="track"><span>por despertar.</span><span>por conectar.</span><span>por crecer.</span><span>por despertar.</span></span></span>`;
  }
  const lead=document.querySelector('.hero-copy .lead');
  if(lead){
    lead.textContent='Descubre una red de negocios locales con presencia digital más profesional. Perfiles claros, contacto directo, visibilidad local y una experiencia moderna pensada para crecer juntos.';
  }
  const badge=document.getElementById('launch-badge-primary');
  if(badge) badge.innerHTML='<i></i> Lanzamiento programado';
});
