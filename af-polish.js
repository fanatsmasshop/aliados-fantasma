(() => {
  'use strict';
  document.documentElement.classList.add('af-polish-ready');
  const body = document.body;
  const qs = s => document.querySelector(s);

  const tidyLiveHome = () => {
    const live = qs('#live-experience');
    if (!live || live.hidden) return;
    const grid = qs('#live-business-grid');
    const cards = grid ? grid.querySelectorAll('.live-business-card') : [];
    const skeletons = grid ? grid.querySelectorAll('.live-skeleton') : [];
    const resultCount = qs('#live-result-count');
    const count = Number.parseInt((resultCount?.textContent || '').replace(/\D+/g,''), 10);
    const businessCount = Number.parseInt((qs('#live-business-count')?.textContent || '').replace(/\D+/g,''), 10);
    const realCount = Number.isFinite(businessCount) ? businessCount : (Number.isFinite(count) ? count : cards.length);

    if (cards.length) skeletons.forEach(node => node.remove());
    body.classList.toggle('af-live-has-businesses', realCount > 0 || cards.length > 0);
    body.classList.toggle('af-live-empty-network', realCount === 0 && cards.length === 0);
    live.classList.toggle('has-businesses', realCount > 0 || cards.length > 0);
    live.classList.toggle('empty-network', realCount === 0 && cards.length === 0);

    const featured = qs('#live-featured-grid');
    qs('#live-featured-section')?.classList.toggle('hidden', !featured?.querySelector('.live-business-card'));
    const promos = qs('#live-promotion-track');
    qs('#live-promotions-section')?.classList.toggle('hidden', !promos?.children.length);

    const slider = qs('#live-slider');
    const active = slider?.querySelector('.live-slide.active');
    if (active) {
      const content = active.querySelector('.live-slide-content');
      if (content) {
        content.style.opacity = '1';
        content.style.visibility = 'visible';
      }
    }
  };

  const observer = new MutationObserver(() => requestAnimationFrame(tidyLiveHome));
  ['#live-business-grid','#live-featured-grid','#live-promotion-track','#live-slider','#live-result-count','#live-business-count'].forEach(sel => {
    const node = qs(sel);
    if (node) observer.observe(node,{childList:true,subtree:true,characterData:true});
  });
  window.addEventListener('load', () => {
    tidyLiveHome();
    setTimeout(tidyLiveHome, 600);
    setTimeout(() => {
      const grid = qs('#live-business-grid');
      if (grid?.querySelector('.live-skeleton') && !grid.querySelector('.live-business-card')) {
        grid.querySelectorAll('.live-skeleton').forEach(node => node.remove());
        tidyLiveHome();
      }
    }, 4200);
  }, {once:true});
})();
