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

  function updateCountdown() {
    const now = new Date();
    const remaining = LAUNCH_DATE.getTime() - now.getTime();

    if (remaining <= 0) {
      showLaunch();
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    elements.days.textContent = pad(days);
    elements.hours.textContent = pad(hours);
    elements.minutes.textContent = pad(minutes);
    elements.seconds.textContent = pad(seconds);

    document.title = `${days}d ${pad(hours)}h | Lanzamiento Aliados Fantasma`;
  }

  function showLaunch() {
    if (hasLaunched) return;
    hasLaunched = true;

    elements.days.textContent = '00';
    elements.hours.textContent = '00';
    elements.minutes.textContent = '00';
    elements.seconds.textContent = '00';

    document.body.classList.add('locked');
    elements.reveal.hidden = false;

    window.setTimeout(() => {
      window.location.replace(OFFICIAL_PAGE);
    }, 1800);
  }

  function animateProgress() {
    const progress = 85;
    window.requestAnimationFrame(() => {
      elements.progressBar.style.width = `${progress}%`;
      elements.progressLabel.textContent = `${progress}%`;
    });
  }

  updateCountdown();
  animateProgress();

  window.setInterval(updateCountdown, 1000);
})();
