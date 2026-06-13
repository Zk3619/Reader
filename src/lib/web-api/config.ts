/**
 * Reader Web 服务配置（对齐 Legado AppConfig.webPort 等）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const PORT_KEY = 'reader_web_service_port';
const ENABLED_KEY = 'reader_web_service_enabled';
const AUTH_ENABLED_KEY = 'reader_web_service_auth_enabled';
const TOKEN_KEY = 'reader_web_service_token';

export const DEFAULT_WEB_SERVICE_PORT = 1122;

export async function getWebServicePort(): Promise<number> {
  const raw = await getStorage<number>(PORT_KEY);
  if (typeof raw === 'number' && raw > 0 && raw < 65536) return raw;
  return DEFAULT_WEB_SERVICE_PORT;
}

export async function setWebServicePort(port: number): Promise<void> {
  await setStorage(PORT_KEY, port);
}

export async function isWebServiceEnabled(): Promise<boolean> {
  const raw = await getStorage<boolean>(ENABLED_KEY);
  return raw === true;
}

export async function setWebServiceEnabled(enabled: boolean): Promise<void> {
  await setStorage(ENABLED_KEY, enabled);
}

export async function isWebServiceAuthEnabled(): Promise<boolean> {
  const raw = await getStorage<boolean>(AUTH_ENABLED_KEY);
  return raw === true;
}

export async function setWebServiceAuthEnabled(enabled: boolean): Promise<void> {
  await setStorage(AUTH_ENABLED_KEY, enabled);
}

export async function getWebServiceToken(): Promise<string> {
  const raw = await getStorage<string>(TOKEN_KEY);
  return typeof raw === 'string' ? raw : '';
}

export async function setWebServiceToken(token: string): Promise<void> {
  await setStorage(TOKEN_KEY, token.trim());
}

/** 生成随机 Token（32 位 hex） */
export function generateWebServiceToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
