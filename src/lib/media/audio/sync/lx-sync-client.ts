/**
 * lx-music-sync-server WebSocket 客户端 v4
 */

import { getSyncState, saveSyncState } from '@/lib/database/audio-library';
import type { AudioSyncState } from '@/lib/media/audio/track-types';
import {
  authenticateSyncServer,
  buildWsConnectToken,
  probeSyncServer,
  type LxClientKeyInfo,
} from '@/lib/media/audio/sync/sync-auth';
import { encryptMsg, decryptMsg } from '@/lib/media/audio/sync/sync-crypto';
import { createMessage2call } from '@/lib/media/audio/sync/message2call';
import {
  createListSyncHandlers,
  resetSyncHandlerState,
  SYNC_FEATURE_VERSION,
} from '@/lib/media/audio/sync/list-sync-handler';
import type { LxSyncMode } from '@/lib/media/audio/sync/list-sync-merge';

export { probeSyncServer } from '@/lib/media/audio/sync/sync-auth';
export type { LxSyncMode };

export interface LxSyncClientOptions {
  serverUrl: string;
  password: string;
  deviceName?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onSyncFinished?: () => void;
  onListAction?: (action: string, data: unknown) => void;
}

let ws: WebSocket | null = null;
let keyInfo: LxClientKeyInfo | null = null;
let msg2call: ReturnType<typeof createMessage2call> | null = null;

export async function connectLxSyncClient(options: LxSyncClientOptions): Promise<void> {
  disconnectLxSyncClient();
  resetSyncHandlerState();

  const base = options.serverUrl.replace(/\/+$/, '');
  keyInfo = await authenticateSyncServer(base, options.password);
  const probe = await probeSyncServer(base);
  if (!probe.ok) throw new Error('无法连接同步服务');

  const token = buildWsConnectToken(keyInfo);
  const wsUrl = `${base.replace(/^http/, 'ws')}/socket?i=${encodeURIComponent(keyInfo.clientId)}&t=${encodeURIComponent(token)}`;
  ws = new WebSocket(wsUrl);

  await new Promise<void>((resolve, reject) => {
    if (!ws) return reject(new Error('WebSocket 未创建'));
    const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), 30_000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('WebSocket 连接失败'));
    };
  });

  const handlers = createListSyncHandlers();
  const handlerMap: Record<string, (...args: unknown[]) => unknown | Promise<unknown>> = {
    getEnabledFeatures: handlers.getEnabledFeatures as (...args: unknown[]) => Promise<unknown>,
    finished: handlers.finished,
    onListSyncAction: handlers.onListSyncAction as (...args: unknown[]) => Promise<unknown>,
    'list.list_sync_get_md5': handlers.list_sync_get_md5,
    'list.list_sync_get_sync_mode': handlers.list_sync_get_sync_mode,
    'list.list_sync_get_list_data': handlers.list_sync_get_list_data,
    'list.list_sync_set_list_data': handlers.list_sync_set_list_data as (...args: unknown[]) => Promise<unknown>,
    'list.list_sync_finished': handlers.list_sync_finished,
    onDislikeSyncAction: handlers.onDislikeSyncAction as (...args: unknown[]) => Promise<unknown>,
    'dislike.dislike_sync_get_md5': handlers.dislike_sync_get_md5,
    'dislike.dislike_sync_get_sync_mode': handlers.dislike_sync_get_sync_mode,
    'dislike.dislike_sync_get_list_data': handlers.dislike_sync_get_list_data,
    'dislike.dislike_sync_set_list_data': handlers.dislike_sync_set_list_data as (...args: unknown[]) => Promise<unknown>,
    'dislike.dislike_sync_finished': handlers.dislike_sync_finished,
  };

  msg2call = createMessage2call(handlerMap, {
    timeout: 120_000,
    sendMessage(data) {
      if (!ws || ws.readyState !== WebSocket.OPEN || !keyInfo) return;
      void encryptMsg(JSON.stringify(data), keyInfo.key).then((enc) => ws!.send(enc));
    },
  });

  ws.onmessage = (ev) => {
    void (async () => {
      if (!keyInfo || !msg2call) return;
      const plain = await decryptMsg(String(ev.data), keyInfo.key);
      if (plain === 'ping') return;
      try {
        const data = JSON.parse(plain) as Record<string, unknown>;
        msg2call.handleMessage(data);
        if (data.method === 'list.onListSyncAction' || data.method === 'onListSyncAction') {
          const params = (data.params as unknown[]) ?? [];
          const payload = params[0] as { action: string; data: unknown };
          options.onListAction?.(payload.action, payload.data);
        }
        if (data.method === 'dislike.onDislikeSyncAction' || data.method === 'onDislikeSyncAction') {
          const params = (data.params as unknown[]) ?? [];
          const payload = params[0] as { action: string; data: unknown };
          options.onListAction?.(payload.action, payload.data);
        }
      } catch {
        // ignore malformed
      }
    })();
  };

  ws.onclose = () => {
    options.onDisconnected?.();
    void saveSyncState({ ...(getSyncStateCached()), connected: false });
  };

  options.onConnected?.();
  await saveSyncState({
    serverUrl: base,
    serverId: probe.serverId ?? '',
    syncMode: getSyncStateCached().syncMode,
    lastSyncAt: Date.now(),
    connected: true,
  });
}

export async function lxSyncCall(method: string, params: unknown[] = []): Promise<unknown> {
  if (!msg2call) throw new Error('同步未连接');
  const parts = method.includes('.') ? method.split('.') : [method];
  return msg2call.call(parts, ...params);
}

export async function lxSyncListAction(
  action: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return lxSyncCall(`list.${action}`, [data]);
}

export async function lxSyncRemoteCall(
  group: 'list' | 'dislike',
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  if (!msg2call) throw new Error('同步未连接');
  return msg2call.createQueueRemote(group).call(method, ...params);
}

let cachedSyncState: AudioSyncState | null = null;

function getSyncStateCached(): AudioSyncState {
  return (
    cachedSyncState ?? {
      serverUrl: '',
      serverId: '',
      syncMode: 'merge_local_remote',
      lastSyncAt: 0,
      connected: false,
    }
  );
}

export function disconnectLxSyncClient(): void {
  msg2call?.destroy();
  msg2call = null;
  ws?.close();
  ws = null;
  keyInfo = null;
}

export async function loadLxSyncConfig(): Promise<AudioSyncState> {
  cachedSyncState = await getSyncState();
  return cachedSyncState;
}

export async function updateLxSyncConfig(patch: Partial<AudioSyncState>): Promise<void> {
  const current = await loadLxSyncConfig();
  const next = { ...current, ...patch };
  cachedSyncState = next;
  await saveSyncState(next);
}

export function getLxSyncFeatureVersion() {
  return SYNC_FEATURE_VERSION;
}
