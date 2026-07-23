/*
  Control de lanzamiento de Aliados Fantasma
  - Público: ve la cuenta regresiva hasta el 24 de agosto de 2026, 2:30 p. m.
  - Administradores y negocios autenticados: pueden revisar la fachada completa antes del lanzamiento.
  - Después de la fecha: la fachada se abre automáticamente para todos.

  Integración recomendada con el sistema real de autenticación:
    window.AF_PRELAUNCH_ACCESS = true;
    window.dispatchEvent(new Event('af-auth-ready'));
  Ejecuta esas dos líneas después de confirmar que el usuario es administrador
  o propietario de un negocio.
*/

(() => {
  const LAUNCH_AT = new Date('2026-08-24T14:30:00-06:00');
  const ALLOWED_ROLES = new Set([
    'admin', 'administrador', 'administrator',
    'negocio', 'propietario', 'business', 'owner'
  ]);

  const $ = (selector) => document.querySelector(selector);
  const gate = $('#launch-gate');
  const site = $('#prelaunch-site');
  if (!gate || !site) return;

  function normalizeRole(value) {
    return String(value || '').trim().toLowerCase();
  }

  function roleIsAllowed(value) {
    if (Array.isArray(value)) return value.some(roleIsAllowed);
    return ALLOWED_ROLES.has(normalizeRole(value));
  }

  function inspectObjectForRole(object) {
    if (!object || typeof object !== 'object') return false;

    const candidates = [
      object.role,
      object.rol,
      object.tipo_usuario,
      object.user_type,
      object.app_role,
      object.user?.role,
      object.user?.rol,
      object.user?.user_metadata?.role,
      object.user?.user_metadata?.rol,
      object.user?.user_metadata?.tipo_usuario,
      object.user?.app_metadata?.role,
      object.user?.app_metadata?.roles,
      object.session?.user?.user_metadata?.role,
      object.session?.user?.user_metadata?.rol,
      object.session?.user?.app_metadata?.role,
      object.session?.user?.app_metadata?.roles
    ];

    return candidates.some(roleIsAllowed);
  }

  function hasStoredAuthorizedRole() {
    const directKeys = ['af_role', 'aliados_role', 'role', 'rol', 'tipo_usuario'];
    for (const key of directKeys) {
      if (roleIsAllowed(localStorage.getItem(key)) || roleIsAllowed(sessionStorage.getItem(key))) {
        return true;
      }
    }

    // Reconoce una sesión de Supabase almacenada en el navegador sin depender
    // del nombre exacto del proyecto.
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.includes('auth-token')) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (inspectObjectForRole(parsed)) return true;
      } catch (_) {
        // Ignora valores que no sean JSON.
      }
    }

    return false;
  }

  function canReviewBeforeLaunch() {
    return window.AF_PRELAUNCH_ACCESS === true || hasStoredAuthorizedRole();
  }

  function openSite(prelaunch = false) {
    document.body.classList.remove('launch-locked');
    gate.hidden = true;
    site.hidden = false;

    if (prelaunch) {
      const badge = $('#preview-access-badge');
      if (badge) badge.hidden = false;
    }
  }

  function lockSite() {
    document.body.classList.add('launch-locked');
    gate.hidden = false;
    site.hidden = true;
  }

  function updateCountdown() {
    const difference = LAUNCH_AT.getTime() - Date.now();
    if (difference <= 0) {
      openSite(false);
      return;
    }

    const totalSeconds = Math.floor(difference / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const values = { days, hours, minutes, seconds };
    Object.entries(values).forEach(([key, value]) => {
      const element = document.querySelector(`[data-countdown="${key}"]`);
      if (element) element.textContent = String(value).padStart(2, '0');
    });
  }

  function resolveAccess() {
    if (Date.now() >= LAUNCH_AT.getTime()) {
      openSite(false);
      return;
    }

    if (canReviewBeforeLaunch()) {
      openSite(true);
      return;
    }

    lockSite();
    updateCountdown();
  }

  resolveAccess();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Permite que auth.js confirme el rol después de cargar la sesión.
  window.addEventListener('af-auth-ready', resolveAccess);
})();
