// ponytail: self-declared age screening, not identity verification; use a dedicated
// assurance provider if the service or a jurisdiction requires stronger proof.
export const MINIMUM_REGISTRATION_AGE = 18;
export const AGE_SCREEN_ERROR = 'Enter a valid date of birth.';
export const AGE_SCREEN_DENIED = 'Account registration is unavailable.';
export const AGE_BLOCK_STORAGE_KEY = 'panorama_registration_blocked_until';

/** @param {unknown} birthDate */
export function registrationAgeError(birthDate, now = new Date()) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return AGE_SCREEN_ERROR;
  const parsed = new Date(birthDate + 'T00:00:00Z');
  const today = now.toISOString().slice(0, 10);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthDate || birthDate > today || birthDate < '1900-01-01') return AGE_SCREEN_ERROR;
  const cutoff = `${now.getUTCFullYear() - MINIMUM_REGISTRATION_AGE}${today.slice(4)}`;
  return birthDate <= cutoff ? null : AGE_SCREEN_DENIED;
}
