(() => {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.classList.add('af-modern-js');

  const finishLoad = () => body.classList.add('af-loaded');
  if (document.readyState === 'complete') finishLoad();
  else window.addEventListener('load', finishLoad, { once: true });
  window.setTimeout(finishLoad, 900);

  // Indicador de lectura global.
  const progress = document.createElement('div');
  progress.className = 'af-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.innerHTML = '<span></span>';
  body.appendChild(progress);
  const progressBar = progress.firstElementChild;

  const updateProgress = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, window.scrollY / max))})`;
  };
  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });

  // Luz ambiental que sigue al puntero, únicamente en dispositivos compatibles.
  if (!reducedMotion && window.matchMedia('(pointer:fine)').matches) {
    let frame = 0;
    window.addEventListener('pointermove', (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty('--af-pointer-x', `${event.clientX}px`);
        root.style.setProperty('--af-pointer-y', `${event.clientY}px`);
      });
    }, { passive: true });
  }

  const cardSelectors = [
    '.stat-card', '.panel', '.launch-card', '.workflow-center', '.profile-access-card',
    '.onboarding-step', '.problem-grid article', '.feature', '.roadmap article',
    '.signal-strip article', '.directory-card', '.business-card', '.marketing-card',
    '.resource-card', '.info-section', '.help-item', '.review-card', '.summary-card',
    '.quick-actions a', '.category-card', '.profile-section', '.profile-card'
  ].join(',');

  const cards = [...document.querySelectorAll(cardSelectors)];
  cards.forEach((card) => {
    card.classList.add('af-card-interactive');
    if (!card.classList.contains('reveal')) card.classList.add('af-enter');

    if (!reducedMotion && window.matchMedia('(pointer:fine)').matches) {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      }, { passive: true });
    }
  });

  if ('IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('af-in');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -36px' });
    document.querySelectorAll('.af-enter').forEach((element, index) => {
      element.style.transitionDelay = `${Math.min(index % 6, 5) * 45}ms`;
      observer.observe(element);
    });
  } else {
    document.querySelectorAll('.af-enter').forEach((element) => element.classList.add('af-in'));
  }

  // Mantiene accesible el menú móvil aunque las hojas antiguas utilicen clases distintas.
  const menuButton = document.querySelector('.menu-button');
  const navigation = document.querySelector('#main-nav');
  const backdrop = document.querySelector('.menu-backdrop');
  if (menuButton && navigation && backdrop) {
    const syncMenu = () => backdrop.classList.toggle('open', navigation.classList.contains('open'));
    menuButton.addEventListener('click', () => window.setTimeout(syncMenu, 0));
    backdrop.addEventListener('click', () => window.setTimeout(syncMenu, 0));
    navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => window.setTimeout(syncMenu, 0)));
  }
})();
