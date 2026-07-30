/**
 * Reglas únicas de contraseña para registro, invitaciones y recuperación.
 * Requisitos visibles en toda la plataforma:
 * - mínimo 8 caracteres
 * - al menos una letra mayúscula
 * - al menos un número
 */
export const PASSWORD_REQUIREMENTS = Object.freeze({
  minLength: 8,
  uppercase: true,
  number: true
});

export const PASSWORD_HELP = 'Usa al menos 8 caracteres, una mayúscula y un número.';

export function passwordChecks(value = '') {
  const password = String(value);
  return {
    minLength: password.length >= PASSWORD_REQUIREMENTS.minLength,
    uppercase: /[A-ZÁÉÍÓÚÑ]/.test(password),
    lowercase: /[a-záéíóúñ]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(password)
  };
}

export function isStrongPassword(value = '') {
  const checks = passwordChecks(value);
  return checks.minLength && checks.uppercase && checks.number;
}

export function passwordScore(value = '') {
  const checks = passwordChecks(value);
  return Object.values(checks).filter(Boolean).length;
}

export function passwordStrength(value = '') {
  if (!value) return { score: 0, label: PASSWORD_HELP, valid: false };
  const score = passwordScore(value);
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte', 'Muy fuerte'];
  return {
    score,
    label: labels[score] || labels[0],
    valid: isStrongPassword(value)
  };
}
