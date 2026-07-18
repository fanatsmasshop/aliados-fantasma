(() => {
  'use strict';

  const LAUNCH_DATE = new Date('2026-08-24T14:30:00-06:00');
  const elements = {
    days: document.querySelector('#days'),
    hours: document.querySelector('#hours'),
    minutes: document.querySelector('#minutes'),
    seconds: document.querySelector('#seconds'),
    menuButton: document.querySelector('#menu-toggle'),
    nav: document.querySelector('#desktop-nav')
  };

  const pad = value => String(Math.max(0, value)).padStart(2, '0');

  function setUnit(unit, value) {
    const formatted = pad(value);
    if (elements[unit]) elements[unit].textContent = formatted;
    document.querySelectorAll(`[data-mirror="${unit}"]`).forEach(node => {
      node.textContent = formatted;
    });
  }

  function updateCountdown() {
    const remaining = Math.max(0, LAUNCH_DATE.getTime() - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    setUnit('days', Math.floor(totalSeconds / 86400));
    setUnit('hours', Math.floor((totalSeconds % 86400) / 3600));
    setUnit('minutes', Math.floor((totalSeconds % 3600) / 60));
    setUnit('seconds', totalSeconds % 60);
  }

  function closeMenu() {
    elements.nav?.classList.remove('open');
    elements.menuButton?.setAttribute('aria-expanded', 'false');
  }

  elements.menuButton?.addEventListener('click', () => {
    const open = elements.nav?.classList.toggle('open') || false;
    elements.menuButton.setAttribute('aria-expanded', String(open));
  });

  elements.nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (!elements.nav?.classList.contains('open')) return;
    if (!elements.nav.contains(event.target) && !elements.menuButton?.contains(event.target)) closeMenu();
  });

  const revealNodes = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -45px' });
    revealNodes.forEach(node => observer.observe(node));
  } else {
    revealNodes.forEach(node => node.classList.add('visible'));
  }

  document.querySelectorAll('.faq-list details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (!detail.open) return;
      document.querySelectorAll('.faq-list details[open]').forEach(other => {
        if (other !== detail) other.open = false;
      });
    });
  });

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
})();
