/**
 * LX Sync v4 认证（/hello、/id、/ah）
 */

import {
  SYNC_AUTH_MSG,
  SYNC_CONNECT_MSG,
  SYNC_HELLO,
  SYNC_ID_PREFIX,
  aesDecrypt,
  aesEncrypt,
  generateRsaKeyPair,
  passwordAesKey,
  rsaDecrypt,
  type LxClientKeyInfo,
} from '@/lib/media/audio/sync/sync-crypto';
import {
  loadMusicSyncAuthKeys,
  saveMusicSyncAuthKeys,
} from '@/lib/persistence/cred-jar';

export type { LxClientKeyInfo };

function loadAuthKeys(): Record<string, LxClientKeyInfo> {
  return loadMusicSyncAuthKeys() as Record<string, LxClientKeyInfo>;
}

function saveAuthKey(serverId: string, info: LxClientKeyInfo): void {
  const all = loadAuthKeys();
  all[serverId] = info;
  saveMusicSyncAuthKeys(all);
}

export function getStoredAuthKey(serverId: string): LxClientKeyInfo | null {
  return loadAuthKeys()[serverId] ?? null;
}

export async function probeSyncServer(
  serverUrl: string,
): Promise<{ ok: boolean; serverId?: string }> {
  try {
    const base = serverUrl.replace(/\/+$/, '');
    const helloRes = await fetch(`${base}/hello`);
    const helloText = await helloRes.text();
    if (!helloText.includes('Hello')) return { ok: false };
    const idRes = await fetch(`${base}/id`);
    const idText = await idRes.text();
    if (!idText.startsWith(SYNC_ID_PREFIX)) return { ok: false };
    return { ok: true, serverId: idText.replace(SYNC_ID_PREFIX, '').trim() };
  } catch {
    return { ok: false };
  }
}

async function codeAuth(
  base: string,
  serverId: string,
  password: string,
  deviceName = 'Reader',
): Promise<LxClientKeyInfo> {
  const key = passwordAesKey(password);
  const { publicKey, privateKey } = generateRsaKeyPair();
  const pubBody = publicKey
    .replace(/\n/g, '')
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '');
  const msg = aesEncrypt(
    `${SYNC_AUTH_MSG}\n${pubBody}\n${deviceName}\nlx_music_desktop`,
    key,
  );
  const res = await fetch(`${base}/ah`, { headers: { m: msg } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'Auth failed');
  const plain = rsaDecrypt(text, privateKey);
  const info = JSON.parse(plain) as LxClientKeyInfo;
  saveAuthKey(serverId, info);
  return info;
}

async function keyAuth(base: string, keyInfo: LxClientKeyInfo): Promise<void> {
  const msg = aesEncrypt(`${SYNC_AUTH_MSG}Reader`, keyInfo.key);
  const res = await fetch(`${base}/ah`, {
    headers: { i: keyInfo.clientId, m: msg },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'Key auth failed');
  const plain = aesDecrypt(text, keyInfo.key);
  if (plain !== SYNC_HELLO) throw new Error('Key auth hello mismatch');
}

export async function authenticateSyncServer(
  serverUrl: string,
  password: string,
): Promise<LxClientKeyInfo> {
  const base = serverUrl.replace(/\/+$/, '');
  const probe = await probeSyncServer(base);
  if (!probe.ok || !probe.serverId) throw new Error('无法连接同步服务');
  const stored = getStoredAuthKey(probe.serverId);
  if (stored) {
    try {
      await keyAuth(base, stored);
      return stored;
    } catch {
      // fall through to code auth
    }
  }
  if (!password) throw new Error('需要连接密码进行首次认证');
  return codeAuth(base, probe.serverId, password);
}

export function buildWsConnectToken(keyInfo: LxClientKeyInfo): string {
  return aesEncrypt(SYNC_CONNECT_MSG, keyInfo.key);
}
