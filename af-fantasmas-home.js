(() => {
  'use strict';

  const initHero = () => {
    const heroTitle = document.querySelector('.hero-copy h1');
    if (!heroTitle || heroTitle.dataset.afRotatorReady === 'true') return;

    heroTitle.dataset.afRotatorReady = 'true';
    heroTitle.className = 'fantasmas-upgraded af-hero-title af-neon-title';
    heroTitle.innerHTML = `
      <span class="line line-one">La red de</span>
      <span class="line line-gradient">negocios locales</span>
      <span class="line line-final">está por</span>
      <span class="line line-dynamic">
        <span class="word-slider" aria-live="polite" aria-atomic="true">
          <span class="word-current">crecer.</span>
        </span>
      </span>
    `;

    const currentWord = heroTitle.querySelector('.word-current');
    if (!currentWord) return;

    const words = ['crecer.', 'conectar.', 'despegar.'];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0;
    let changing = false;

    const changeWord = () => {
      if (changing || document.hidden) return;
      changing = true;

      currentWord.classList.remove('af-word-in');
      currentWord.classList.add('af-word-out');

      window.setTimeout(() => {
        index = (index + 1) % words.length;
        currentWord.textContent = words[index];
        currentWord.classList.remove('af-word-out');
        currentWord.classList.add('af-word-prep');

        // Fuerza un nuevo frame para que la entrada sí sea visible.
        void currentWord.offsetWidth;
        currentWord.classList.remove('af-word-prep');
        currentWord.classList.add('af-word-in');

        window.setTimeout(() => {
          currentWord.classList.remove('af-word-in');
          changing = false;
        }, 360);
      }, 260);
    };

    window.clearInterval(window.afHeroWordTimer);
    if (!reducedMotion) {
      window.setTimeout(changeWord, 1400);
      window.afHeroWordTimer = window.setInterval(changeWord, 3000);
    }

    const lead = document.querySelector('.hero-copy .lead');
    if (lead) {
      lead.textContent = 'Descubre una red de negocios locales con presencia digital más profesional. Perfiles claros, contacto directo, visibilidad local y una experiencia moderna pensada para crecer juntos.';
    }

    const badge = document.getElementById('launch-badge-primary');
    if (badge) badge.innerHTML = '<i></i> Lanzamiento programado';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHero, { once: true });
  } else {
    initHero();
  }
})();
