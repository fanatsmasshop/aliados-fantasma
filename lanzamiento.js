(() => {
  'use strict';
  const launchDate = new Date('2026-08-24T14:30:00-06:00');
  const startDate = new Date('2026-07-01T00:00:00-06:00');
  const ids = ['days','hours','minutes','seconds'];
  const pad = n => String(Math.max(0,n)).padStart(2,'0');
  function update(){
    const now = Date.now();
    const remaining = Math.max(0, launchDate.getTime() - now);
    const seconds = Math.floor(remaining / 1000);
    const values = {
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60
    };
    ids.forEach(id => { const el=document.getElementById(id); if(el) el.textContent=pad(values[id]); });
    const total = launchDate.getTime() - startDate.getTime();
    const elapsed = Math.max(0, Math.min(total, now - startDate.getTime()));
    const progress = document.getElementById('launch-progress');
    if(progress) progress.style.width = `${(elapsed / total) * 100}%`;
    if(remaining === 0){
      const card=document.querySelector('.countdown-card');
      if(card) card.classList.add('launched');
    }
  }
  update();
  setInterval(update,1000);
})();
