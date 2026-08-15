(() => {
  'use strict';

  const body = document.body;
  const tablet = window.matchMedia('(max-width: 850px)');
  const phone = window.matchMedia('(max-width: 720px)');
  const merchantPhone = window.matchMedia('(max-width: 700px)');

  /* -------------------------------------------------------
     PORTALES MÓVILES
     Mueve drawers a <body> para que ningún transform/grid/overflow
     heredado de layouts antiguos los comprima o desplace.
     ------------------------------------------------------- */
  const portals = new WeakMap();

  function portalToBody(element) {
    if (!element || element.parentElement === body) return;
    if (!portals.has(element)) {
      const marker = document.createComment(`af-mobile-portal:${element.id || element.className || element.tagName}`);
      element.parentNode?.insertBefore(marker, element);
      portals.set(element, marker);
    }
    body.appendChild(element);
  }

  function restorePortal(element) {
    const marker = element && portals.get(element);
    if (!element || !marker || !marker.parentNode) return;
    marker.parentNode.insertBefore(element, marker.nextSibling);
  }

  /* -------------------------------------------------------
     VIEWPORT VISUAL
     Mantiene modales/toasts dentro del área visible incluso con
     teclado móvil o barras del navegador abiertas.
     ------------------------------------------------------- */
  function syncVisualViewport() {
    const vv = window.visualViewport;
    const height = vv?.height || window.innerHeight;
    const top = vv?.offsetTop || 0;
    document.documentElement.style.setProperty('--af-visual-height', `${Math.max(260, height)}px`);
    document.documentElement.style.setProperty('--af-visual-top', `${Math.max(0, top)}px`);
  }

  window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });
  window.addEventListener('resize', syncVisualViewport, { passive: true });
  syncVisualViewport();

  /* -------------------------------------------------------
     MENÚ PÚBLICO
     El propio lanzamiento.js conserva la lógica abrir/cerrar.
     Aquí solo aseguramos portal, accesibilidad y estado visual.
     ------------------------------------------------------- */
  function initPublicMenu() {
    if (!body.classList.contains('af-page-home')) return;
    const nav = document.querySelector('#main-nav');
    const button = document.querySelector('.menu-button');
    const backdrop = document.querySelector('.menu-backdrop');
    const close = nav?.querySelector('.drawer-close');
    if (!nav || !button || !backdrop) return;

    const syncPlacement = () => {
      if (phone.matches) {
        portalToBody(backdrop);
        portalToBody(nav);
      } else {
        restorePortal(nav);
        restorePortal(backdrop);
      }
    };

    const syncState = () => {
      const open = phone.matches && nav.classList.contains('open');
      nav.setAttribute('aria-hidden', String(phone.matches && !open));
      button.setAttribute('aria-expanded', String(open));
      body.classList.toggle('menu-open', open);
      if (phone.matches && open) {
        nav.removeAttribute('inert');
      } else if (phone.matches) {
        nav.setAttribute('inert', '');
      } else {
        nav.removeAttribute('inert');
        nav.removeAttribute('aria-hidden');
      }
    };

    syncPlacement();
    syncState();

    const observer = new MutationObserver(syncState);
    observer.observe(nav, { attributes: true, attributeFilter: ['class'] });

    button.addEventListener('click', () => requestAnimationFrame(syncState));
    backdrop.addEventListener('click', () => requestAnimationFrame(syncState));
    close?.addEventListener('click', () => requestAnimationFrame(syncState));
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => requestAnimationFrame(syncState)));

    phone.addEventListener?.('change', () => {
      syncPlacement();
      syncState();
    });
  }

  /* -------------------------------------------------------
     MENÚ ADMIN
     ui.js abre el menú. Esta capa garantiza drawer real, cierre,
     portal a body y sincronización de backdrop.
     ------------------------------------------------------- */
  function initAdminMenu() {
    if (!body.classList.contains('af-page-admin')) return;
    const sidebar = document.querySelector('#sidebar');
    const button = document.querySelector('#menu-button');
    if (!sidebar || !button) return;

    let overlay = document.querySelector('#overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'overlay';
      overlay.className = 'overlay hidden';
      body.appendChild(overlay);
    }

    let close = sidebar.querySelector('.af-mobile-sidebar-close');
    if (!close) {
      close = document.createElement('button');
      close.type = 'button';
      close.className = 'af-mobile-sidebar-close';
      close.setAttribute('aria-label', 'Cerrar menú');
      close.textContent = '×';
      sidebar.prepend(close);
    }

    button.setAttribute('aria-controls', 'sidebar');

    const closeMenu = ({ focus = false } = {}) => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
      body.classList.remove('af-mobile-sidebar-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Abrir menú de administración');
      if (focus) setTimeout(() => button.focus(), 20);
    };

    const syncState = () => {
      const open = tablet.matches && sidebar.classList.contains('open');
      body.classList.toggle('af-mobile-sidebar-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Cerrar menú de administración' : 'Abrir menú de administración');
      if (open) overlay.classList.remove('hidden');
      sidebar.setAttribute('aria-hidden', String(tablet.matches && !open));
      if (tablet.matches && !open) sidebar.setAttribute('inert', '');
      else sidebar.removeAttribute('inert');
    };

    const syncPlacement = () => {
      if (tablet.matches) {
        portalToBody(overlay);
        portalToBody(sidebar);
      } else {
        closeMenu();
        restorePortal(sidebar);
        restorePortal(overlay);
        sidebar.removeAttribute('aria-hidden');
        sidebar.removeAttribute('inert');
      }
    };

    syncPlacement();
    syncState();

    // Si el shell administrativo todavía no ha agregado su listener,
    // garantizamos la apertura al final del mismo click sin duplicar toggle.
    button.addEventListener('click', () => {
      if (!tablet.matches) return;
      setTimeout(() => {
        if (!sidebar.classList.contains('open')) sidebar.classList.add('open');
        syncState();
        setTimeout(() => close.focus(), 20);
      }, 0);
    });

    close.addEventListener('click', () => closeMenu({ focus: true }));
    overlay.addEventListener('click', () => closeMenu({ focus: true }));
    sidebar.querySelectorAll('a.nav-link').forEach(link => link.addEventListener('click', () => closeMenu()));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sidebar.classList.contains('open')) closeMenu({ focus: true });
    });

    new MutationObserver(syncState).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    tablet.addEventListener?.('change', () => {
      syncPlacement();
      syncState();
    });
  }

  /* -------------------------------------------------------
     MENÚ DEL NEGOCIO
     panel.js conserva lógica/acciones. Solo lo desacoplamos del
     owner-sidebar para que jamás herede grid/overflow antiguos.
     ------------------------------------------------------- */
  function initMerchantMenu() {
    if (!body.classList.contains('af-page-owner')) return;
    const menu = document.querySelector('#merchant-side-menu');
    const backdrop = document.querySelector('#merchant-menu-backdrop');
    if (!menu || !backdrop) return;

    const syncPlacement = () => {
      if (merchantPhone.matches) {
        portalToBody(backdrop);
        portalToBody(menu);
      } else {
        restorePortal(menu);
        restorePortal(backdrop);
      }
    };

    syncPlacement();
    merchantPhone.addEventListener?.('change', syncPlacement);
  }

  /* -------------------------------------------------------
     TABLAS ADMIN => LISTAS
     ------------------------------------------------------- */
  function labelTable(table) {
    if (!(table instanceof HTMLTableElement) || !table.classList.contains('data-table')) return;
    table.classList.add('af-mobile-list-table');
    const headers = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim() || 'Dato');
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.children].filter(el => el.tagName === 'TD').forEach((td, index) => {
        if (td.hasAttribute('colspan')) return;
        td.dataset.label = td.dataset.label || headers[index] || 'Dato';
      });
    });
  }

  function initMobileTables() {
    document.querySelectorAll('table.data-table').forEach(labelTable);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches?.('table.data-table')) labelTable(node);
          node.querySelectorAll?.('table.data-table').forEach(labelTable);
          const parentTable = node.closest?.('table.data-table');
          if (parentTable) labelTable(parentTable);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });
  }

  /* -------------------------------------------------------
     DIRECTORIO: filtro plegable estable en móvil
     ------------------------------------------------------- */
  function initDirectoryFilters() {
    if (!body.classList.contains('af-page-directory')) return;
    const layout = document.querySelector('.directory-layout');
    const sidebar = document.querySelector('.directory-sidebar');
    if (!layout || !sidebar) return;

    let toggle = document.querySelector('#directory-filter-toggle') || layout.querySelector('.af-mobile-filter-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'directory-filter-toggle';
      toggle.className = 'af-mobile-filter-toggle';
      toggle.innerHTML = 'Filtros <span class="directory-filter-count"></span>';
      layout.insertBefore(toggle, sidebar);
    }

    const sync = () => {
      if (!phone.matches) {
        toggle.setAttribute('aria-expanded', 'true');
        sidebar.classList.remove('af-mobile-filters-collapsed');
        return;
      }
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      sidebar.classList.toggle('af-mobile-filters-collapsed', !expanded);
    };

    if (!toggle.hasAttribute('aria-expanded')) toggle.setAttribute('aria-expanded', phone.matches ? 'false' : 'true');
    toggle.addEventListener('click', () => {
      if (!phone.matches) return;
      toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
      sync();
    });
    phone.addEventListener?.('change', sync);
    sync();
  }

  /* -------------------------------------------------------
     CONTENIDO LARGO / ENLACES
     ------------------------------------------------------- */
  function normalizeLongContent() {
    document.querySelectorAll('input[type="text"], input[type="url"], input[type="email"], .copy-link-row input').forEach(input => {
      input.setAttribute('spellcheck', 'false');
    });
  }

  initPublicMenu();
  initAdminMenu();
  initMerchantMenu();
  initMobileTables();
  initDirectoryFilters();
  normalizeLongContent();
})();
