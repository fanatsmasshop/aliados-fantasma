/*
 * Aliados Fantasma · UI Stability Layer
 * 2026-08-20 · v1
 *
 * Capa final, idempotente y transversal para corregir conflictos de interfaz
 * heredados entre app.css / onboarding / af-modern / af-ux / mobile / Lo necesito.
 * No contiene lógica de negocio ni modifica datos.
 */
(() => {
  'use strict';

  if (window.__AF_UI_STABILITY_V1__) return;
  window.__AF_UI_STABILITY_V1__ = true;

  const root = document.documentElement;
  const body = document.body;
  if (!body) return;

  const MODAL_SELECTOR = [
    '.modal', '.af-modal', '.rules-modal', '.context-modal', '.profile-report-modal',
    '.profile-lightbox', '.need-modal', '#review-modal', '#quote-modal', '#business-modal',
    '#admin-action-modal', '#moderation-list-modal', '#delete-business-modal',
    '#delete-business-modal-runtime', '#af-action-modal'
  ].join(',');

  const CARD_SELECTOR = [
    '.modal-card', '.af-modal-card', '.rules-card', '.context-dialog',
    '.profile-report-card', '.need-modal-card', '.review-modal-card'
  ].join(',');

  const MESSAGE_SELECTOR = '#global-message, .need-alert.show';
  const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let locked = false;
  let lockY = 0;
  let savedBodyStyle = null;
  let previousFocus = null;
  let activeModal = null;
  let lastViewportMessage = { text: '', at: 0 };
  const activated = new WeakSet();

  function syncVisualViewport() {
    const vv = window.visualViewport;
    const width = Math.max(280, vv?.width || window.innerWidth || root.clientWidth || 360);
    const height = Math.max(260, vv?.height || window.innerHeight || root.clientHeight || 640);
    const top = Math.max(0, vv?.offsetTop || 0);
    const left = Math.max(0, vv?.offsetLeft || 0);
    root.style.setProperty('--af-ui-vv-width', `${width}px`);
    root.style.setProperty('--af-ui-vv-height', `${height}px`);
    root.style.setProperty('--af-ui-vv-top', `${top}px`);
    root.style.setProperty('--af-ui-vv-left', `${left}px`);
  }

  function injectStyles() {
    if (document.querySelector('#af-ui-stability-style')) return;
    const style = document.createElement('style');
    style.id = 'af-ui-stability-style';
    style.textContent = `
/* ===== Aliados Fantasma · estabilidad transversal ===== */
:root{
  --af-ui-vv-width:100vw;
  --af-ui-vv-height:100dvh;
  --af-ui-vv-top:0px;
  --af-ui-vv-left:0px;
  --af-ui-safe:clamp(10px,2vw,18px);
  --af-ui-surface:#10141e;
  --af-ui-line:rgba(255,255,255,.13);
  --af-ui-muted:#a9b2c3;
}
html,body{max-width:100%;}
html.af-ui-dialog-open{overflow:hidden!important;overscroll-behavior:none!important;}
body.af-ui-scroll-lock{overflow:hidden!important;overscroll-behavior:none!important;}
body.af-ui-scroll-lock .af-scroll-progress{display:none!important;}

/* No permitir que grids/flex heredados creen ancho fantasma. */
body :where(main,section,article,aside,header,footer,nav,form,fieldset,div,label){min-width:0;}
body :where(img,video,canvas,svg,iframe){max-width:100%;}
body :where(input,textarea,select,button){max-width:100%;box-sizing:border-box;}
body :where(p,h1,h2,h3,h4,strong,small,a,span){overflow-wrap:anywhere;}
body :where(.content,.app-main,.owner-main,.owner-shell,.owner-overview-grid,.panel,.toolbar,.page-head,.need-shell,.need-main-grid,.need-business-body,.profile-content,.profile-main,.marketing-main){min-width:0;max-width:100%;}
body :where(.table-wrap,.data-table-wrap){max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;}
body :where(.actions,.row-actions,.workflow-actions,.profile-access-actions,.need-modal-actions,.need-opportunity-actions,.review-links,.toolbar){min-width:0;}

/* Foco visible coherente. */
body :where(button,a,input,textarea,select,[tabindex]):focus-visible{
  outline:2px solid #65dfff!important;
  outline-offset:3px!important;
}

/* ===== Ventanas: siempre relativas al viewport VISUAL ===== */
body>.af-ui-modal-root{
  position:fixed!important;
  top:var(--af-ui-vv-top)!important;
  left:var(--af-ui-vv-left)!important;
  right:auto!important;
  bottom:auto!important;
  width:var(--af-ui-vv-width)!important;
  height:var(--af-ui-vv-height)!important;
  min-height:0!important;
  max-height:var(--af-ui-vv-height)!important;
  margin:0!important;
  padding:max(var(--af-ui-safe),env(safe-area-inset-top)) max(var(--af-ui-safe),env(safe-area-inset-right)) max(var(--af-ui-safe),env(safe-area-inset-bottom)) max(var(--af-ui-safe),env(safe-area-inset-left))!important;
  box-sizing:border-box!important;
  z-index:2147482000!important;
  overflow:auto!important;
  overscroll-behavior:contain!important;
  -webkit-overflow-scrolling:touch!important;
  place-items:center!important;
  align-items:center!important;
  justify-items:center!important;
  background:rgba(2,4,10,.80)!important;
  -webkit-backdrop-filter:blur(10px)!important;
  backdrop-filter:blur(10px)!important;
}
body>.af-ui-modal-root.hidden,
body>.af-ui-modal-root[hidden],
body>.af-ui-modal-root[aria-hidden="true"]{display:none!important;}
body>.af-ui-modal-root:not(.hidden):not([hidden]):not([aria-hidden="true"]){display:grid;}
body>.af-ui-modal-root.need-modal:not(.show){display:none!important;}
body>.af-ui-modal-root.need-modal.show{display:grid!important;}

body>.af-ui-modal-root > :where(${CARD_SELECTOR}){
  position:relative!important;
  inset:auto!important;
  transform:none!important;
  margin:auto!important;
  width:min(780px,calc(var(--af-ui-vv-width) - 2 * var(--af-ui-safe)))!important;
  max-width:calc(var(--af-ui-vv-width) - 2 * var(--af-ui-safe))!important;
  max-height:calc(var(--af-ui-vv-height) - 2 * var(--af-ui-safe))!important;
  min-height:0!important;
  box-sizing:border-box!important;
  overflow:auto!important;
  overscroll-behavior:contain!important;
  -webkit-overflow-scrolling:touch!important;
  scroll-behavior:auto!important;
}
body>.af-ui-modal-root #business-modal .modal-card{width:min(900px,calc(var(--af-ui-vv-width) - 2 * var(--af-ui-safe)))!important;}

/* Cabecera y acciones siempre alcanzables dentro de ventanas largas. */
body>.af-ui-modal-root :where(.modal-head,.need-modal-head){
  position:sticky!important;
  top:0!important;
  z-index:5!important;
  margin-top:-1px!important;
  padding-top:2px!important;
  padding-bottom:12px!important;
  background:linear-gradient(180deg,rgba(15,19,29,.99) 0%,rgba(15,19,29,.96) 78%,rgba(15,19,29,0) 100%)!important;
}
body>.af-ui-modal-root :where(.actions:last-child,.af-modal-actions,.need-modal-actions){
  position:sticky!important;
  bottom:0!important;
  z-index:5!important;
  margin-bottom:-1px!important;
  padding-top:14px!important;
  padding-bottom:2px!important;
  background:linear-gradient(0deg,rgba(15,19,29,.99) 0%,rgba(15,19,29,.96) 78%,rgba(15,19,29,0) 100%)!important;
}
body>.af-ui-modal-root :where(textarea,input,select){min-width:0!important;}

/* Revisión administrativa completa. */
body>#review-modal.af-ui-modal-root .review-modal-card{
  width:min(820px,calc(var(--af-ui-vv-width) - 2 * var(--af-ui-safe)))!important;
  padding:clamp(18px,2.4vw,26px)!important;
}
body>#review-modal .quality-panel{min-width:0!important;}
body>#review-modal #admin-comment{min-height:120px!important;max-height:32vh!important;resize:vertical!important;}
body>#review-modal .review-links{display:flex!important;flex-wrap:wrap!important;gap:8px!important;}
body>#review-modal .review-links .button{min-width:0!important;}
body>#review-modal .qr-box{max-width:100%!important;flex-wrap:wrap!important;overflow:hidden!important;}
body>#review-modal .qr-box img{flex:0 0 auto!important;max-width:min(150px,40vw)!important;height:auto!important;}

/* Cotización / solicitud. */
body>#quote-modal.af-ui-modal-root .need-modal-card{width:min(620px,calc(var(--af-ui-vv-width) - 2 * var(--af-ui-safe)))!important;}

/* ===== Mensajes: siempre en el viewport actual ===== */
#af-ui-viewport-messages{
  position:fixed!important;
  top:calc(var(--af-ui-vv-top) + max(12px,env(safe-area-inset-top)))!important;
  left:calc(var(--af-ui-vv-left) + var(--af-ui-vv-width) / 2)!important;
  width:min(560px,calc(var(--af-ui-vv-width) - 24px))!important;
  transform:translateX(-50%)!important;
  z-index:2147483000!important;
  display:grid!important;
  gap:8px!important;
  pointer-events:none!important;
}
.af-ui-viewport-message{
  position:relative!important;
  width:100%!important;
  box-sizing:border-box!important;
  display:grid!important;
  grid-template-columns:34px minmax(0,1fr) 28px!important;
  gap:10px!important;
  align-items:start!important;
  padding:12px 12px 12px 13px!important;
  border:1px solid rgba(255,255,255,.14)!important;
  border-radius:15px!important;
  color:#f8fafc!important;
  background:rgba(13,17,26,.98)!important;
  box-shadow:0 18px 55px rgba(0,0,0,.48)!important;
  -webkit-backdrop-filter:blur(16px)!important;
  backdrop-filter:blur(16px)!important;
  pointer-events:auto!important;
  animation:afUiMessageIn .18s ease-out both!important;
}
.af-ui-viewport-message[data-type="success"]{border-color:rgba(74,222,128,.35)!important;}
.af-ui-viewport-message[data-type="warning"]{border-color:rgba(251,191,36,.38)!important;}
.af-ui-viewport-message[data-type="error"]{border-color:rgba(251,113,133,.42)!important;}
.af-ui-viewport-message .af-ui-msg-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:rgba(255,255,255,.06);font-size:17px;}
.af-ui-viewport-message .af-ui-msg-copy{min-width:0;font-size:13px;line-height:1.45;font-weight:650;overflow-wrap:anywhere;}
.af-ui-viewport-message .af-ui-msg-close{width:28px!important;height:28px!important;min-height:28px!important;padding:0!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#aab3c3!important;font-size:18px!important;cursor:pointer!important;}
@keyframes afUiMessageIn{from{opacity:0;transform:translateY(-8px) scale(.985)}to{opacity:1;transform:none}}

/* Los toasts clásicos también se fijan a la zona visible. */
body>.toast-box{
  position:fixed!important;
  top:calc(var(--af-ui-vv-top) + max(12px,env(safe-area-inset-top)))!important;
  left:calc(var(--af-ui-vv-left) + var(--af-ui-vv-width) / 2)!important;
  right:auto!important;
  bottom:auto!important;
  width:min(500px,calc(var(--af-ui-vv-width) - 24px))!important;
  transform:translateX(-50%)!important;
  z-index:2147482900!important;
  pointer-events:none!important;
}
body>.toast-box .toast{width:100%!important;box-sizing:border-box!important;pointer-events:auto!important;overflow-wrap:anywhere!important;}

/* ===== Layouts conflictivos ===== */
body.af-page-admin .app-main,
body.af-page-owner .owner-main{overflow:visible!important;}
body.af-page-admin .content{width:100%!important;box-sizing:border-box!important;}
body.af-page-owner #onboarding-form{box-sizing:border-box!important;}
body.af-page-owner .wizard-actions{max-width:100%!important;}
body.need-page{overflow-x:clip!important;}
body.need-page .need-header-inner,
body.need-page .need-footer-inner,
body.need-page .need-shell{max-width:100%!important;box-sizing:border-box!important;}
body.need-page .need-opportunity,
body.need-page .need-card{min-width:0!important;}

@media(max-width:850px){
  html,body{width:100%;max-width:100%;overflow-x:clip!important;}
  body :where(input,textarea,select){font-size:16px!important;}
  body :where(.page-head,.need-business-top,.need-results-head){min-width:0!important;}
  body.af-page-admin .page-head{align-items:stretch!important;}
  body.af-page-admin .page-head>.button{width:100%!important;}
  body.af-page-admin :where(.toolbar,.actions,.row-actions){max-width:100%!important;}
  body.af-page-owner .owner-main{width:100%!important;}
  body.af-page-owner #onboarding-form{padding-bottom:calc(88px + env(safe-area-inset-bottom))!important;}
  body.af-page-owner .wizard-actions{bottom:max(8px,env(safe-area-inset-bottom))!important;}
  body.need-page .need-header-actions{min-width:0!important;}
  body.need-page .need-business-top{align-items:stretch!important;}
  body.need-page .need-business-id{min-width:0!important;width:100%!important;}
}

@media(max-width:680px){
  body>.af-ui-modal-root{padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom))!important;}
  body>.af-ui-modal-root > :where(${CARD_SELECTOR}){
    width:calc(var(--af-ui-vv-width) - 16px)!important;
    max-width:calc(var(--af-ui-vv-width) - 16px)!important;
    max-height:calc(var(--af-ui-vv-height) - 16px)!important;
    border-radius:18px!important;
  }
  body>#review-modal.af-ui-modal-root .review-modal-card{width:calc(var(--af-ui-vv-width) - 16px)!important;}
  body>#review-modal .quality-panel{grid-template-columns:1fr!important;gap:10px!important;}
  body>#review-modal .actions{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;}
  body>#review-modal .actions .button{width:100%!important;}
  body>#review-modal .review-links{display:grid!important;grid-template-columns:1fr!important;}
  body>#review-modal .review-links .button{width:100%!important;}
  body>#review-modal .qr-box{display:grid!important;grid-template-columns:1fr!important;justify-items:start!important;}
  body>.af-ui-modal-root .need-modal-actions{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;}
  body>.af-ui-modal-root .need-modal-actions .need-button{width:100%!important;}
  #af-ui-viewport-messages{width:calc(var(--af-ui-vv-width) - 18px)!important;}
  .af-ui-viewport-message{grid-template-columns:30px minmax(0,1fr) 26px!important;padding:11px!important;border-radius:14px!important;}
  .af-ui-viewport-message .af-ui-msg-icon{width:30px;height:30px;font-size:15px;}
}

@media(prefers-reduced-motion:reduce){
  .af-ui-viewport-message{animation:none!important;}
}
`;
    document.head.appendChild(style);
  }

  function isHidden(el) {
    if (!(el instanceof Element)) return true;
    if (el.hidden) return true;
    if (el.classList.contains('hidden')) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (el.classList.contains('need-modal') && !el.classList.contains('show')) return true;
    try { return getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden'; }
    catch { return false; }
  }

  function portalize(el) {
    if (!(el instanceof Element) || !el.matches(MODAL_SELECTOR)) return;
    el.classList.add('af-ui-modal-root');
    if (el.parentElement !== body) body.appendChild(el);
  }

  function modalCard(el) {
    return el?.querySelector(CARD_SELECTOR) || null;
  }

  function lockPage() {
    if (locked) return;
    locked = true;
    lockY = window.scrollY || root.scrollTop || 0;
    savedBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    };
    body.style.position = 'fixed';
    body.style.top = `-${lockY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.classList.add('af-ui-scroll-lock');
    root.classList.add('af-ui-dialog-open');
  }

  function unlockPage() {
    if (!locked) return;
    locked = false;
    const saved = savedBodyStyle || {};
    body.style.position = saved.position || '';
    body.style.top = saved.top || '';
    body.style.left = saved.left || '';
    body.style.right = saved.right || '';
    body.style.width = saved.width || '';
    body.style.overflow = saved.overflow || '';
    body.classList.remove('af-ui-scroll-lock');
    root.classList.remove('af-ui-dialog-open');
    savedBodyStyle = null;
    requestAnimationFrame(() => window.scrollTo({ top: lockY, left: 0, behavior: 'auto' }));
  }

  function focusFirstUseful(modal) {
    if (!modal) return;
    const preferred = modal.querySelector('[data-close], .need-modal-close, .notification-close, input:not([type="hidden"]), textarea, select, button:not([disabled]), a[href]');
    if (preferred instanceof HTMLElement) {
      try { preferred.focus({ preventScroll: true }); } catch { preferred.focus(); }
    }
  }

  function activateModal(modal) {
    if (!modal || isHidden(modal)) return;
    portalize(modal);
    modal.scrollTop = 0;
    const card = modalCard(modal);
    if (card) card.scrollTop = 0;
    if (!activated.has(modal)) {
      activated.add(modal);
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      requestAnimationFrame(() => {
        modal.scrollTop = 0;
        if (card) card.scrollTop = 0;
        focusFirstUseful(modal);
      });
    }
  }

  function syncModals() {
    document.querySelectorAll(MODAL_SELECTOR).forEach(portalize);
    const open = [...document.querySelectorAll(MODAL_SELECTOR)].filter(el => !isHidden(el));

    if (open.length) {
      lockPage();
      const top = open[open.length - 1];
      if (activeModal !== top) {
        if (activeModal) activated.delete(activeModal);
        activeModal = top;
        activateModal(top);
      }
      open.forEach(activateModal);
    } else {
      if (activeModal) activated.delete(activeModal);
      activeModal = null;
      unlockPage();
      if (previousFocus?.isConnected) {
        try { previousFocus.focus({ preventScroll: true }); } catch {}
      }
      previousFocus = null;
    }
  }

  function ensureMessageStack() {
    let stack = document.querySelector('#af-ui-viewport-messages');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'af-ui-viewport-messages';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'false');
      body.appendChild(stack);
    }
    return stack;
  }

  function inferMessageType(node) {
    const cls = `${node?.className || ''}`.toLowerCase();
    if (/danger|error|invalid/.test(cls)) return 'error';
    if (/warning|warn|pending/.test(cls)) return 'warning';
    return 'success';
  }

  function showViewportMessage(text, type = 'success', timeout = 5600) {
    text = String(text || '').trim();
    if (!text) return;
    const now = Date.now();
    if (lastViewportMessage.text === text && now - lastViewportMessage.at < 900) return;
    lastViewportMessage = { text, at: now };

    const stack = ensureMessageStack();
    const message = document.createElement('div');
    message.className = 'af-ui-viewport-message';
    message.dataset.type = type;
    message.setAttribute('role', type === 'error' ? 'alert' : 'status');
    const icon = type === 'error' ? '!' : type === 'warning' ? '⚠' : '✓';
    message.innerHTML = `<span class="af-ui-msg-icon" aria-hidden="true">${icon}</span><div class="af-ui-msg-copy"></div><button type="button" class="af-ui-msg-close" aria-label="Cerrar aviso">×</button>`;
    message.querySelector('.af-ui-msg-copy').textContent = text;
    const close = () => message.remove();
    message.querySelector('.af-ui-msg-close').addEventListener('click', close);
    stack.appendChild(message);
    if (timeout > 0) window.setTimeout(close, timeout);
  }

  function syncMessageNode(node) {
    if (!(node instanceof Element) || !node.matches(MESSAGE_SELECTOR)) return;
    if (node.classList.contains('hidden') || node.hidden) return;
    const text = node.textContent?.trim();
    if (!text) return;
    showViewportMessage(text, inferMessageType(node));
  }

  function scanMessages(scope = document) {
    if (scope instanceof Element && scope.matches(MESSAGE_SELECTOR)) syncMessageNode(scope);
    scope.querySelectorAll?.(MESSAGE_SELECTOR).forEach(syncMessageNode);
  }

  function closeTopModalOnEscape(event) {
    if (event.key !== 'Escape') return;
    const open = [...document.querySelectorAll(MODAL_SELECTOR)].filter(el => !isHidden(el));
    const modal = open[open.length - 1];
    if (!modal) return;
    const close = modal.querySelector('[data-close], [data-af-cancel], .need-modal-close, #report-close, #lightbox-close, .lightbox-close');
    if (close instanceof HTMLElement) {
      event.preventDefault();
      close.click();
    }
  }

  function normalizeDynamicContent(scope = document) {
    const selector = 'input[type="text"],input[type="url"],input[type="email"],input[type="tel"],textarea';
    if (scope instanceof Element && scope.matches(selector)) scope.setAttribute('spellcheck', scope.type === 'email' ? 'false' : scope.getAttribute('spellcheck') ?? 'false');
    scope.querySelectorAll?.(selector).forEach(el => {
      if (!el.hasAttribute('spellcheck')) el.setAttribute('spellcheck', 'false');
    });
  }

  function auditOverflow() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const width = vv?.width || window.innerWidth;
    const right = left + width;
    const offenders = [];
    document.querySelectorAll('body *').forEach(el => {
      if (!(el instanceof HTMLElement)) return;
      if (el.closest('.af-ui-modal-root') || el.id === 'af-ui-viewport-messages') return;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.display === 'none') return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > right + 3 || rect.left < left - 3)) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: String(el.className || '').slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        });
      }
    });
    return offenders.slice(0, 100);
  }

  window.afViewportMessage = showViewportMessage;
  window.afUIAudit = () => ({
    viewport: {
      width: window.visualViewport?.width || window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
      offsetTop: window.visualViewport?.offsetTop || 0
    },
    openModals: [...document.querySelectorAll(MODAL_SELECTOR)].filter(el => !isHidden(el)).map(el => el.id || el.className),
    horizontalOverflow: auditOverflow()
  });

  injectStyles();
  syncVisualViewport();
  document.querySelectorAll(MODAL_SELECTOR).forEach(portalize);
  normalizeDynamicContent();
  scanMessages();
  syncModals();

  window.visualViewport?.addEventListener('resize', () => { syncVisualViewport(); syncModals(); }, { passive: true });
  window.visualViewport?.addEventListener('scroll', () => { syncVisualViewport(); }, { passive: true });
  window.addEventListener('resize', () => { syncVisualViewport(); syncModals(); }, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(() => { syncVisualViewport(); syncModals(); }, 120), { passive: true });
  document.addEventListener('keydown', closeTopModalOnEscape);

  let frame = 0;
  const scheduleSync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      syncVisualViewport();
      syncModals();
    });
  };

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches(MODAL_SELECTOR)) portalize(node);
          node.querySelectorAll?.(MODAL_SELECTOR).forEach(portalize);
          normalizeDynamicContent(node);
          scanMessages(node);
        });
      } else if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target instanceof Element) {
          if (target.matches(MODAL_SELECTOR)) portalize(target);
          if (target.matches(MESSAGE_SELECTOR) || target.id === 'global-message' || target.classList.contains('need-alert')) syncMessageNode(target);
        }
      } else if (mutation.type === 'characterData') {
        const parent = mutation.target.parentElement;
        if (parent?.matches?.(MESSAGE_SELECTOR)) syncMessageNode(parent);
      }
    }
    scheduleSync();
  });

  observer.observe(body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
  });
})();
