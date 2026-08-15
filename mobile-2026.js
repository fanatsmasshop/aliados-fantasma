(() => {
  'use strict';

  const mq = window.matchMedia('(max-width: 850px)');
  const small = window.matchMedia('(max-width: 720px)');
  const body = document.body;

  // Admin: drawer accesible, con cierre visible, backdrop, Escape y cierre al navegar.
  function initAdminMenu(){
    if(!body.classList.contains('af-page-admin')) return;
    const sidebar = document.querySelector('#sidebar');
    const button = document.querySelector('#menu-button');
    let overlay = document.querySelector('#overlay');
    if(!sidebar || !button) return;
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'overlay';
      overlay.className = 'overlay hidden';
      body.appendChild(overlay);
    }

    button.setAttribute('aria-controls','sidebar');
    button.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    if(!button.getAttribute('aria-label')) button.setAttribute('aria-label','Abrir menú de administración');

    let close = sidebar.querySelector('.af-mobile-sidebar-close');
    if(!close){
      close = document.createElement('button');
      close.type = 'button';
      close.className = 'af-mobile-sidebar-close';
      close.setAttribute('aria-label','Cerrar menú');
      close.textContent = '×';
      const brand = sidebar.querySelector('.sidebar-brand');
      if(brand) brand.insertAdjacentElement('afterend', close); else sidebar.prepend(close);
    }

    const openMenu = () => {
      if(!mq.matches) return;
      sidebar.classList.add('open');
      overlay.classList.remove('hidden');
      body.classList.add('af-mobile-sidebar-open');
      button.setAttribute('aria-expanded','true');
      button.setAttribute('aria-label','Cerrar menú de administración');
      setTimeout(() => close.focus(), 20);
    };
    const closeMenu = ({focus=false}={}) => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
      body.classList.remove('af-mobile-sidebar-open');
      button.setAttribute('aria-expanded','false');
      button.setAttribute('aria-label','Abrir menú de administración');
      if(focus) setTimeout(() => button.focus(), 20);
    };

    // add(), no toggle(): compatible con ui.js existente.
    button.addEventListener('click', openMenu);
    close.addEventListener('click', () => closeMenu({focus:true}));
    overlay.addEventListener('click', () => closeMenu({focus:true}));
    sidebar.querySelectorAll('a.nav-link').forEach(link => link.addEventListener('click', () => closeMenu()));
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && sidebar.classList.contains('open')) closeMenu({focus:true}); });
    mq.addEventListener?.('change', e => { if(!e.matches) closeMenu(); });
  }

  // Tablas administrativas convertidas a listas legibles en móvil.
  function labelTable(table){
    if(!(table instanceof HTMLTableElement)) return;
    if(!table.classList.contains('data-table')) return;
    table.classList.add('af-mobile-list-table');
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim() || 'Dato');
    table.querySelectorAll('tbody tr').forEach(row => {
      const cells = [...row.children].filter(el => el.tagName === 'TD');
      cells.forEach((td, index) => {
        if(td.hasAttribute('colspan')) return;
        if(!td.dataset.label) td.dataset.label = headers[index] || 'Dato';
      });
    });
  }

  function initMobileTables(){
    document.querySelectorAll('table.data-table').forEach(labelTable);
    const observer = new MutationObserver(mutations => {
      for(const mutation of mutations){
        if(mutation.type !== 'childList') continue;
        const table = mutation.target.closest?.('table.data-table');
        if(table) labelTable(table);
        mutation.addedNodes.forEach(node => {
          if(!(node instanceof Element)) return;
          if(node.matches?.('table.data-table')) labelTable(node);
          node.querySelectorAll?.('table.data-table').forEach(labelTable);
        });
      }
    });
    observer.observe(document.body,{subtree:true,childList:true});
  }

  // Menú público: sincroniza accesibilidad y estado visual con el drawer existente.
  function initPublicMenu(){
    if(!body.classList.contains('af-page-home')) return;
    const nav = document.querySelector('#main-nav');
    const button = document.querySelector('.menu-button');
    const backdrop = document.querySelector('.menu-backdrop');
    if(!nav || !button || !backdrop) return;

    const sync = () => {
      const open = nav.classList.contains('open');
      nav.setAttribute('aria-hidden', small.matches && !open ? 'true' : 'false');
      button.setAttribute('aria-expanded', String(open));
      body.classList.toggle('menu-open', open && small.matches);
    };
    button.addEventListener('click', () => requestAnimationFrame(sync));
    backdrop.addEventListener('click', () => requestAnimationFrame(sync));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => requestAnimationFrame(sync)));
    document.querySelector('.drawer-close')?.addEventListener('click', () => requestAnimationFrame(sync));
    new MutationObserver(sync).observe(nav,{attributes:true,attributeFilter:['class']});
    small.addEventListener?.('change', sync);
    sync();
  }



  function initDirectoryFilters(){
    if(!body.classList.contains('af-page-directory')) return;
    const layout = document.querySelector('.directory-layout');
    const sidebar = document.querySelector('.directory-sidebar');
    if(!layout || !sidebar) return;
    let toggle = layout.querySelector('.af-mobile-filter-toggle');
    if(!toggle){
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'af-mobile-filter-toggle';
      toggle.textContent = 'Filtros del directorio';
      layout.insertBefore(toggle, sidebar);
    }
    const syncMode = () => {
      if(small.matches){
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        sidebar.classList.toggle('af-mobile-filters-collapsed', !expanded);
      }else{
        sidebar.classList.remove('af-mobile-filters-collapsed');
        toggle.setAttribute('aria-expanded','true');
      }
    };
    toggle.setAttribute('aria-expanded', small.matches ? 'false' : 'true');
    toggle.addEventListener('click', () => {
      const next = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(next));
      sidebar.classList.toggle('af-mobile-filters-collapsed', !next);
      if(next) setTimeout(() => sidebar.scrollIntoView({block:'nearest'}), 10);
    });
    small.addEventListener?.('change', () => {
      toggle.setAttribute('aria-expanded', small.matches ? 'false' : 'true');
      syncMode();
    });
    syncMode();
  }

  // Previene que elementos de acciones se salgan por textos largos.
  function normalizeLongContent(){
    document.querySelectorAll('a[href], input[value], .copy-link-row input').forEach(el => {
      if(el instanceof HTMLInputElement && el.type === 'text') el.setAttribute('spellcheck','false');
    });
  }

  initAdminMenu();
  initMobileTables();
  initPublicMenu();
  initDirectoryFilters();
  normalizeLongContent();
})();
