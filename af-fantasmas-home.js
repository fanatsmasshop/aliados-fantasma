(() => {
  'use strict';

  const initAliadosHero = () => {
    const heroTitle = document.querySelector('.hero-copy h1');
    if (!heroTitle || heroTitle.dataset.afRotatorReady === 'true') return;

    heroTitle.dataset.afRotatorReady = 'true';
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
      let transitionTimer = 0;

      const changeWord = () => {
        if (document.hidden || slider.dataset.changing === 'true') return;

        slider.dataset.changing = 'true';
        currentWord.classList.add('is-fading-out');

        window.clearTimeout(transitionTimer);
        transitionTimer = window.setTimeout(() => {
          index = (index + 1) % words.length;
          currentWord.textContent = words[index];
          currentWord.classList.remove('is-fading-out');
          currentWord.classList.add('is-fading-in');

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              currentWord.classList.remove('is-fading-in');
              slider.dataset.changing = 'false';
            });
          });
        }, 210);
      };

      window.clearInterval(window.afHeroWordTimer);
      window.afHeroWordTimer = window.setInterval(changeWord, 3200);
    }

    const lead = document.querySelector('.hero-copy .lead');
    if (lead) {
      lead.textContent = 'Descubre una red de negocios locales con presencia digital más profesional. Perfiles claros, contacto directo, visibilidad local y una experiencia moderna pensada para crecer juntos.';
    }

    const badge = document.getElementById('launch-badge-primary');
    if (badge) badge.innerHTML = '<i></i> Lanzamiento programado';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAliadosHero, { once: true });
  } else {
    initAliadosHero();
  }
})();
