export const MINIMUM_REGISTRATION_AGE: 18;
export const AGE_SCREEN_ERROR: string;
export const AGE_SCREEN_DENIED: string;
export const AGE_BLOCK_STORAGE_KEY: string;
export function registrationAgeError(birthDate: unknown, now?: Date): string | null;
