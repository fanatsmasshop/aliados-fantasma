(() => {
  'use strict';

  const LAUNCH_DATE = new Date('2026-08-24T14:30:00-06:00');
  const OFFICIAL_PAGE = 'index-oficial.html';

  const elements = {
    days: document.querySelector('#days'),
    hours: document.querySelector('#hours'),
    minutes: document.querySelector('#minutes'),
    seconds: document.querySelector('#seconds'),
    progressBar: document.querySelector('#progress-bar'),
    progressLabel: document.querySelector('#progress-label'),
    reveal: document.querySelector('#launch-reveal')
  };

  let hasLaunched = false;

  function pad(value) {
    return String(Math.max(0, value)).padStart(2, '0');
  }

  function mirror(unit, value) {
    document.querySelectorAll(`[data-mirror="${unit}"]`).forEach((node) => {
      node.textContent = value;
    });
  }

  function setUnit(unit, value) {
    const formatted = pad(value);
    if (elements[unit]) {
      elements[unit].textContent = formatted;
    }
    mirror(unit, formatted);
  }

  function updateCountdown() {
    const remaining = LAUNCH_DATE.getTime() - Date.now();

    if (remaining <= 0) {
      showLaunch();
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    setUnit('days', days);
    setUnit('hours', hours);
    setUnit('minutes', minutes);
    setUnit('seconds', seconds);

    document.title = `${days}d ${pad(hours)}h | Lanzamiento gratuito`;
  }

  function showLaunch() {
    if (hasLaunched) return;
    hasLaunched = true;

    ['days', 'hours', 'minutes', 'seconds'].forEach((unit) => setUnit(unit, 0));

    document.body.classList.add('locked');
    if (elements.reveal) {
      elements.reveal.hidden = false;
    }

    window.setTimeout(() => {
      window.location.replace(OFFICIAL_PAGE);
    }, 1800);
  }

  function animateProgress() {
    const progress = 85;
    window.requestAnimationFrame(() => {
      if (elements.progressBar) {
        elements.progressBar.style.width = `${progress}%`;
      }
      if (elements.progressLabel) {
        elements.progressLabel.textContent = `${progress}%`;
      }
    });
  }

  updateCountdown();
  animateProgress();
  window.setInterval(updateCountdown, 1000);
})();
