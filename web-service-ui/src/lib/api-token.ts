const TOKEN_STORAGE_KEY = 'reader_web_service_token';

export function getStoredWebToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredWebToken(token: string): void {
  try {
    if (token.trim()) sessionStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function withTokenQuery(path: string): string {
  const token = getStoredWebToken();
  if (!token || path.includes('token=')) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}
