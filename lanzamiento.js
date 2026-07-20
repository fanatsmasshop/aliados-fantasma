import { getLaunchState, trustedNowMs } from './launch-control.js?v=20260720-600';

await (async () => {
  'use strict';

  let launchState = await getLaunchState();
  const elements = {
    days: document.querySelector('#days'),
    hours: document.querySelector('#hours'),
    minutes: document.querySelector('#minutes'),
    seconds: document.querySelector('#seconds'),
    menuButton: document.querySelector('#menu-toggle'),
    nav: document.querySelector('#desktop-nav'),
    countdown: document.querySelector('#countdown'),
    countdownWrap: document.querySelector('.countdown-wrap'),
    miniCountdown: document.querySelector('.mini-countdown')
  };

  const pad = value => String(Math.max(0, value)).padStart(2, '0');
  let productionModeApplied = false;

  function setUnit(unit, value) {
    const formatted = pad(value);
    if (elements[unit]) elements[unit].textContent = formatted;
    document.querySelectorAll(`[data-mirror="${unit}"]`).forEach(node => {
      node.textContent = formatted;
    });
  }

  function updateTextLink(link, text, href) {
    if (!link) return;
    link.href = href;
    const arrow = link.querySelector('span');
    link.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.textContent = `${text} `;
    });
    if (!Array.from(link.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) {
      link.insertBefore(document.createTextNode(`${text} `), arrow || null);
    }
  }

  function applyProductionMode() {
    if (productionModeApplied) return;
    productionModeApplied = true;
    document.documentElement.dataset.siteMode = 'production';

    const registerLinks = Array.from(document.querySelectorAll('a[href="registro.html"]'));
    const headerCta = document.querySelector('.header-contact');
    const heroCta = document.querySelector('.hero-actions a.button.primary');
    const finalCta = document.querySelector('.launch-actions a.button.primary');

    updateTextLink(headerCta, 'Explorar negocios', 'explorar.html');
    updateTextLink(heroCta, 'Explorar negocios', 'explorar.html');
    updateTextLink(finalCta, 'Explorar la red', 'explorar.html');

    registerLinks.forEach(link => {
      if (link === headerCta || link === heroCta || link === finalCta) return;
      if (link.closest('footer')) link.textContent = 'Registrar mi negocio';
    });

    if (elements.countdownWrap) {
      elements.countdownWrap.classList.add('launch-complete');
      elements.countdownWrap.innerHTML = '<p class="countdown-label">ALIADOS FANTASMA YA ESTÁ EN LÍNEA</p><div class="launch-live-message"><strong>La red local ya despertó.</strong><span>Explora negocios participantes o registra el tuyo para formar parte.</span><a class="button primary" href="explorar.html">Explorar negocios <span aria-hidden="true">→</span></a></div>';
    }
    if (elements.miniCountdown) {
      elements.miniCountdown.innerHTML = '<span class="launch-live-dot" aria-hidden="true"></span><strong>Plataforma pública disponible</strong>';
      elements.miniCountdown.classList.add('is-live');
    }
  }

  function updateCountdown() {
    const remaining = launchState.open ? 0 : launchState.launchAtMs - trustedNowMs();
    if (remaining <= 0) {
      setUnit('days', 0); setUnit('hours', 0); setUnit('minutes', 0); setUnit('seconds', 0);
      applyProductionMode();
      return;
    }
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
