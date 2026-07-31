document.addEventListener('DOMContentLoaded', () => {
  const heroTitle = document.querySelector('.hero-copy h1');

  if (heroTitle) {
    heroTitle.classList.add('fantasmas-upgraded', 'af-hero-title', 'af-neon-title');
    heroTitle.innerHTML = `
      <span class="line line-one">La red de</span>
      <span class="line line-gradient">negocios locales</span>
      <span class="line line-final">está por <span class="word-slider" aria-live="polite" aria-atomic="true"><span class="word-current">crecer.</span></span></span>
    `;

    const slider = heroTitle.querySelector('.word-slider');
    const currentWord = heroTitle.querySelector('.word-current');
    const words = ['crecer.', 'conectar.', 'despegar.'];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (slider && currentWord && !reducedMotion) {
      let index = 0;
      let changing = false;
      const changeWord = () => {
        if (changing || document.hidden) return;
        changing = true;
        slider.classList.add('is-leaving');
        window.setTimeout(() => {
          index = (index + 1) % words.length;
          currentWord.textContent = words[index];
          slider.classList.remove('is-leaving');
          slider.classList.add('is-entering');
          requestAnimationFrame(() => requestAnimationFrame(() => {
            slider.classList.remove('is-entering');
            changing = false;
          }));
        }, 240);
      };
      window.clearInterval(window.afHeroWordTimer);
      window.afHeroWordTimer = window.setInterval(changeWord, 3000);
    }
  }

  const lead = document.querySelector('.hero-copy .lead');
  if (lead) {
    lead.textContent = 'Descubre una red de negocios locales con presencia digital más profesional. Perfiles claros, contacto directo, visibilidad local y una experiencia moderna pensada para crecer juntos.';
  }

  const badge = document.getElementById('launch-badge-primary');
  if (badge) badge.innerHTML = '<i></i> Lanzamiento programado';
});
