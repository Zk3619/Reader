/**
 * sessionStorage 临时会话封装（不跨重启）
 */

const PREFIX = 'reader.ephemeral.';

export function getEphemeral<T>(key: string): T | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setEphemeral<T>(key: string, value: T): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function removeEphemeral(key: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* */
  }
}

export function getEphemeralString(key: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function setEphemeralString(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PREFIX + key, value);
  } catch {
    /* */
  }
}
