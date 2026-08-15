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



  // Ventanas y mensajes siempre relativos al viewport visible.
  // Algunos paneles antiguos contienen modales dentro de elementos transformados;
  // mover el overlay al body evita que position:fixed se vuelva relativo al contenedor.
  const viewportModalSelector = [
    '.modal', '.af-modal', '.rules-modal', '.context-modal',
    '.profile-report-modal', '.profile-lightbox',
    '#admin-action-modal', '#moderation-list-modal', '#delete-business-modal-runtime',
    '#delete-business-modal', '#af-action-modal'
  ].join(',');

  const portalizeModal = (element) => {
    if (!(element instanceof Element) || !element.matches(viewportModalSelector)) return;
    element.classList.add('af-viewport-modal');
    if (element.parentElement !== body) body.appendChild(element);
  };

  const modalIsOpen = (element) => {
    if (!element || element.classList.contains('hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return getComputedStyle(element).display !== 'none';
  };

  const syncDialogState = () => {
    const open = [...document.querySelectorAll(viewportModalSelector)].some(modalIsOpen);
    body.classList.toggle('af-dialog-open', open);
    root.classList.toggle('af-dialog-open', open);
  };

  const scanViewportModals = (scope = document) => {
    if (scope instanceof Element && scope.matches(viewportModalSelector)) portalizeModal(scope);
    scope.querySelectorAll?.(viewportModalSelector).forEach(portalizeModal);
    syncDialogState();
  };

  scanViewportModals();
  let dialogFrame = 0;
  const scheduleDialogSync = () => {
    cancelAnimationFrame(dialogFrame);
    dialogFrame = requestAnimationFrame(() => scanViewportModals());
  };
  const dialogObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(viewportModalSelector)) portalizeModal(node);
          node.querySelectorAll?.(viewportModalSelector).forEach(portalizeModal);
        });
      }
    }
    scheduleDialogSync();
  });
  dialogObserver.observe(body, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style','aria-hidden']});

  // Mantiene el foco dentro de la ventana visible cuando se abre mediante teclado.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const visible = [...document.querySelectorAll(viewportModalSelector)].filter(modalIsOpen).pop();
    if (!visible) return;
    const close = visible.querySelector('[data-close], [data-af-cancel], #report-close, #lightbox-close, .lightbox-close');
    if (close instanceof HTMLElement) close.click();
  });

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
