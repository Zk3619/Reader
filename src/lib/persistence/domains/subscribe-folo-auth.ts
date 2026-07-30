/**
 * Folo 实验账号会话（本地存储，不进备份域）
 */

import { deleteStorage, getStorage, setStorage } from '@/lib/platform/storage';
import { createSignal } from 'solid-js';

export const SUBSCRIBE_FOLO_AUTH_STORAGE_KEY = 'subscribe_folo_auth_v1';
export const SUBSCRIBE_FOLO_AUTH_VERSION = 1;

export interface SubscribeFoloAuthSnapshot {
  version: typeof SUBSCRIBE_FOLO_AUTH_VERSION;
  sessionToken: string;
  userName: string;
  userEmail: string;
  userImage: string;
  loggedInAt: number;
  lastSyncedAt: number;
}

const EMPTY: SubscribeFoloAuthSnapshot = {
  version: SUBSCRIBE_FOLO_AUTH_VERSION,
  sessionToken: '',
  userName: '',
  userEmail: '',
  userImage: '',
  loggedInAt: 0,
  lastSyncedAt: 0,
};

let cached = EMPTY;
const [subscribeFoloAuthRevision, setSubscribeFoloAuthRevision] = createSignal(0);
export { subscribeFoloAuthRevision };

function bump(): void {
  setSubscribeFoloAuthRevision((value) => value + 1);
}

export async function getSubscribeFoloAuth(): Promise<SubscribeFoloAuthSnapshot> {
  const stored = await getStorage<SubscribeFoloAuthSnapshot>(SUBSCRIBE_FOLO_AUTH_STORAGE_KEY);
  if (stored?.version === SUBSCRIBE_FOLO_AUTH_VERSION && stored.sessionToken) {
    cached = {
      version: SUBSCRIBE_FOLO_AUTH_VERSION,
      sessionToken: String(stored.sessionToken ?? ''),
      userName: String(stored.userName ?? ''),
      userEmail: String(stored.userEmail ?? ''),
      userImage: String(stored.userImage ?? ''),
      loggedInAt: Number(stored.loggedInAt) || 0,
      lastSyncedAt: Number(stored.lastSyncedAt) || 0,
    };
    return cached;
  }
  cached = EMPTY;
  return cached;
}

export async function saveSubscribeFoloAuth(
  patch: Partial<Omit<SubscribeFoloAuthSnapshot, 'version'>>,
): Promise<SubscribeFoloAuthSnapshot> {
  const next: SubscribeFoloAuthSnapshot = {
    ...cached,
    ...patch,
    version: SUBSCRIBE_FOLO_AUTH_VERSION,
  };
  cached = next;
  if (!next.sessionToken) {
    await deleteStorage(SUBSCRIBE_FOLO_AUTH_STORAGE_KEY);
  } else {
    await setStorage(SUBSCRIBE_FOLO_AUTH_STORAGE_KEY, next);
  }
  bump();
  return next;
}

export async function clearSubscribeFoloAuth(): Promise<void> {
  cached = EMPTY;
  await deleteStorage(SUBSCRIBE_FOLO_AUTH_STORAGE_KEY);
  bump();
}

export function peekSubscribeFoloAuth(): SubscribeFoloAuthSnapshot {
  return cached;
}
