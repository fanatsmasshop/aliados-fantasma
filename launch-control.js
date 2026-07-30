import { supabase } from './supabase-client.js?v=20260718-120';

export const LAUNCH_TIMEZONE = 'America/Mexico_City';
export const LAUNCH_PENDING_LABEL = 'fecha por confirmar';

// La fecha anterior fue cancelada. Se ignora de forma preventiva incluso antes
// de ejecutar la migración, para que nunca vuelva a mostrarse públicamente.
const CANCELLED_LEGACY_LAUNCH_AT_MS = Date.parse('2026-08-24T20:30:00.000Z');

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

export function formatLaunchDate(iso, { includeTime = true } = {}) {
  if (!iso) return 'Fecha por confirmar';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';

  const options = includeTime
    ? {
        timeZone: LAUNCH_TIMEZONE,
        dateStyle: 'long',
        timeStyle: 'short'
      }
    : {
        timeZone: LAUNCH_TIMEZONE,
        dateStyle: 'long'
      };

  const value = new Intl.DateTimeFormat('es-MX', options).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function toMexicoCityInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LAUNCH_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const renderedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return renderedAsUtc - date.getTime();
}

export function mexicoCityInputToIso(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  );

  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getTimeZoneOffsetMs(new Date(candidate), LAUNCH_TIMEZONE);
    candidate = localAsUtc - offset;
  }

  return new Date(candidate).toISOString();
}

export async function getLaunchState({ refresh = false } = {}) {
  if (cachedState && !refresh) return cachedState;
  if (!initialized) {
    initialized = true;
    await syncClock();
  }

  // Si Supabase no responde, el estado seguro es cerrado y sin fecha.
  let mode = 'cerrado';
  let configuredAt = null;
  let presentationMode = 'breve';
  let presentationFrequency = 'una_vez';
  let presentationTarget = 'inicio';
  let presentationVersion = 1;

  try {
    const { data, error } = await supabase
      .from('configuracion_sistema')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      mode = data.modo_lanzamiento || mode;
      configuredAt = data.lanzamiento_at || null;
      presentationMode = ['evento', 'breve', 'ninguna'].includes(data.presentacion_modo)
        ? data.presentacion_modo
        : presentationMode;
      presentationFrequency = ['solo_lanzamiento', 'una_vez', 'cada_entrada'].includes(data.presentacion_frecuencia)
        ? data.presentacion_frecuencia
        : presentationFrequency;
      presentationTarget = ['inicio', 'directorio'].includes(data.presentacion_destino)
        ? data.presentacion_destino
        : presentationTarget;
      presentationVersion = Number.isInteger(data.presentacion_version) && data.presentacion_version > 0
        ? data.presentacion_version
        : presentationVersion;
    }
  } catch (error) {
    console.warn('No fue posible consultar la configuración de lanzamiento. Se mantendrá cerrado por seguridad.', error);
  }

  let launchAtMs = configuredAt ? Date.parse(configuredAt) : Number.NaN;
  if (launchAtMs === CANCELLED_LEGACY_LAUNCH_AT_MS) {
    configuredAt = null;
    launchAtMs = Number.NaN;
  }

  const hasDate = Number.isFinite(launchAtMs);
  const nowMs = trustedNowMs();
  const open = mode === 'abierto' || (mode === 'automatico' && hasDate && nowMs >= launchAtMs);
  const launchAtIso = hasDate ? new Date(launchAtMs).toISOString() : null;

  cachedState = {
    open,
    mode,
    nowMs,
    hasDate,
    datePending: !hasDate,
    launchAtMs: hasDate ? launchAtMs : null,
    launchAtIso,
    launchLabel: hasDate ? formatLaunchDate(launchAtIso) : 'Fecha por confirmar',
    clockOffsetMs,
    presentationMode,
    presentationFrequency,
    presentationTarget,
    presentationVersion
  };

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
