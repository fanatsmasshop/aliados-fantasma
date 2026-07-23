import { supabase } from './supabase-client.js?v=20260720-600';

export const LAUNCH_AT_ISO = '2026-08-24T20:30:00.000Z';
export const LAUNCH_AT_MS = Date.parse(LAUNCH_AT_ISO);
export const LAUNCH_LABEL = '24 de agosto de 2026 a las 2:30 p. m. (hora de Ciudad de México)';

let cachedState = null;
let clockOffsetMs = 0;
let initialized = false;

async function syncClock() {
  try {
    const response = await fetch(location.href, { method: 'HEAD', cache: 'no-store' });
    const serverDate = response.headers.get('date');
    if (serverDate) clockOffsetMs = Date.parse(serverDate) - Date.now();
  } catch (error) {
    console.warn('No fue posible sincronizar la hora del servidor; se usará la hora del dispositivo.', error);
  }
}

export function trustedNowMs() {
  return Date.now() + clockOffsetMs;
}

export async function getLaunchState({ refresh = false } = {}) {
  if (cachedState && !refresh) return cachedState;
  if (!initialized) {
    initialized = true;
    await syncClock();
  }

  let mode = 'automatico';
  let configuredAt = LAUNCH_AT_ISO;
  try {
    const { data, error } = await supabase
      .from('configuracion_sistema')
      .select('modo_lanzamiento,lanzamiento_at')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data) {
      mode = data.modo_lanzamiento || mode;
      configuredAt = data.lanzamiento_at || configuredAt;
    }
  } catch (error) {
    console.warn('Se aplicará el modo automático local de lanzamiento.', error);
  }

  const launchAtMs = Date.parse(configuredAt) || LAUNCH_AT_MS;
  const nowMs = trustedNowMs();
  const open = mode === 'abierto' || (mode === 'automatico' && nowMs >= launchAtMs);
  cachedState = { open, mode, nowMs, launchAtMs, launchAtIso: new Date(launchAtMs).toISOString(), clockOffsetMs };
  return cachedState;
}

export function clearLaunchStateCache() {
  cachedState = null;
}

export async function isAdministrator() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from('perfiles').select('rol,activo').eq('id', user.id).maybeSingle();
    return data?.rol === 'administrador' && data?.activo === true;
  } catch {
    return false;
  }
}

export async function canAccessPublicAreaBeforeLaunch() {
  const state = await getLaunchState();
  return state.open || await isAdministrator();
}
