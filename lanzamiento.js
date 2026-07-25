(() => {
  'use strict';

  const launchDate = new Date('2026-08-24T14:30:00-06:00');
  const startDate = new Date('2026-07-01T00:00:00-06:00');
  const pad = value => String(Math.max(0, value)).padStart(2, '0');

  function updateCountdown() {
    const now = Date.now();
    const remaining = Math.max(0, launchDate.getTime() - now);
    const seconds = Math.floor(remaining / 1000);
    const values = {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60
    };

    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = pad(value);
    });

    const bottomDays = document.getElementById('days-bottom');
    const bottomHours = document.getElementById('hours-bottom');
    if (bottomDays) bottomDays.textContent = pad(values.days);
    if (bottomHours) bottomHours.textContent = pad(values.hours);

    const total = launchDate.getTime() - startDate.getTime();
    const elapsed = Math.max(0, Math.min(total, now - startDate.getTime()));
    const progress = document.getElementById('launch-progress');
    if (progress && total > 0) progress.style.width = `${(elapsed / total) * 100}%`;

    if (remaining === 0) document.querySelector('.countdown-card')?.classList.add('launched');
  }

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.12 })
    : null;

  document.querySelectorAll('.reveal').forEach(element => {
    if (observer) observer.observe(element);
    else element.classList.add('visible');
  });

  const menuButton = document.querySelector('.menu-button');
  const nav = document.getElementById('main-nav');
  const drawerClose = document.querySelector('.drawer-close');
  const menuBackdrop = document.querySelector('.menu-backdrop');

  function openMenu() {
    if (!nav || !menuButton) return;
    nav.classList.add('open');
    document.body.classList.add('menu-open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Cerrar menú de navegación');
    window.setTimeout(() => drawerClose?.focus(), 30);
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!nav || !menuButton) return;
    nav.classList.remove('open');
    document.body.classList.remove('menu-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Abrir menú de navegación');
    if (restoreFocus) window.setTimeout(() => menuButton.focus(), 20);
  }

  menuButton?.addEventListener('click', () => {
    nav?.classList.contains('open') ? closeMenu({ restoreFocus: true }) : openMenu();
  });
  drawerClose?.addEventListener('click', () => closeMenu({ restoreFocus: true }));
  menuBackdrop?.addEventListener('click', () => closeMenu({ restoreFocus: true }));
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('open')) closeMenu({ restoreFocus: true });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 720) closeMenu();
  });

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
})();
