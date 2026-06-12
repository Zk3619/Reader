/**
 * Reader Web 服务配置（对齐 Legado AppConfig.webPort 等）
 */

import { getStorage, setStorage } from '@/lib/platform/storage';

const PORT_KEY = 'reader_web_service_port';
const ENABLED_KEY = 'reader_web_service_enabled';

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
