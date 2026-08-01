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
    let running = false;

    const changeWord = async () => {
      if (running || document.hidden) return;
      running = true;

      try {
        if (!reducedMotion && currentWord.animate) {
          await currentWord.animate(
            [
              { opacity: 1, transform: 'translateY(0)' },
              { opacity: 0, transform: 'translateY(-0.22em)' }
            ],
            { duration: 220, easing: 'ease-in', fill: 'forwards' }
          ).finished;
        }

        index = (index + 1) % words.length;
        currentWord.textContent = words[index];

        if (!reducedMotion && currentWord.animate) {
          await currentWord.animate(
            [
              { opacity: 0, transform: 'translateY(0.22em)' },
              { opacity: 1, transform: 'translateY(0)' }
            ],
            { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }
          ).finished;
        } else {
          currentWord.style.opacity = '1';
          currentWord.style.transform = 'none';
        }
      } catch (_) {
        currentWord.style.opacity = '1';
        currentWord.style.transform = 'none';
      } finally {
        running = false;
      }
    };

    window.clearInterval(window.afHeroWordTimer);
    if (!reducedMotion) {
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
    document.addEventListener('DOMContentLoaded', initHero, { once: true });
  } else {
    initHero();
  }
})();
