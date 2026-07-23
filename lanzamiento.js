(() => {
  'use strict';
  const launchDate = new Date('2026-08-24T14:30:00-06:00');
  const startDate = new Date('2026-07-01T00:00:00-06:00');
  const pad = n => String(Math.max(0,n)).padStart(2,'0');

  function updateCountdown(){
    const now = Date.now();
    const remaining = Math.max(0, launchDate.getTime() - now);
    const seconds = Math.floor(remaining / 1000);
    const values = {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60
    };
    Object.entries(values).forEach(([id,value]) => {
      const el = document.getElementById(id);
      if(el) el.textContent = pad(value);
    });
    const bottomDays = document.getElementById('days-bottom');
    const bottomHours = document.getElementById('hours-bottom');
    if(bottomDays) bottomDays.textContent = pad(values.days);
    if(bottomHours) bottomHours.textContent = pad(values.hours);
    const total = launchDate.getTime() - startDate.getTime();
    const elapsed = Math.max(0, Math.min(total, now - startDate.getTime()));
    const progress = document.getElementById('launch-progress');
    if(progress) progress.style.width = `${(elapsed / total) * 100}%`;
    if(remaining === 0){
      document.querySelector('.countdown-card')?.classList.add('launched');
    }
  }

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(entry => {
        if(entry.isIntersecting){ entry.target.classList.add('visible'); observer.unobserve(entry.target); }
      }), { threshold: .12 })
    : null;
  document.querySelectorAll('.reveal').forEach(el => observer ? observer.observe(el) : el.classList.add('visible'));

  const menuButton = document.querySelector('.menu-button');
  const nav = document.getElementById('main-nav');
  menuButton?.addEventListener('click', () => {
    const isOpen = nav?.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(Boolean(isOpen)));
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded','false');
  }));

  updateCountdown();
  setInterval(updateCountdown,1000);
})();
