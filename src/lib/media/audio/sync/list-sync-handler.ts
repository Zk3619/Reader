/**
 * LX Sync v4 客户端 handler（暴露给服务端 RPC 调用）
 */

import {
  getLocalLxDislikeData,
  getLocalLxListData,
  getLxDislikeMd5,
  getLxListDataMd5,
  setLocalLxDislikeData,
  setLocalLxListData,
} from '@/lib/media/audio/sync/list-sync-data';
import { handleLxDislikeAction, handleLxListAction } from '@/lib/media/audio/sync/lx-sync-actions';
import type { LxSyncMode } from '@/lib/media/audio/sync/list-sync-merge';
import { loadLxSyncConfig } from '@/lib/media/audio/sync/lx-sync-client';

export const SYNC_FEATURE_VERSION = { list: 1, dislike: 1 } as const;

export type LxSyncActionPayload = { action: string; data: unknown };

let listSyncReady = false;
let dislikeSyncReady = false;
let syncModeResolver: ((mode: LxSyncMode) => void) | null = null;

export function requestSyncModeFromUi(): Promise<LxSyncMode> {
  return new Promise((resolve) => {
    syncModeResolver = resolve;
    void loadLxSyncConfig().then((cfg) => {
      resolve((cfg.syncMode as LxSyncMode) ?? 'merge_local_remote');
      syncModeResolver = null;
    });
  });
}

export function setSyncModeForHandler(mode: LxSyncMode): void {
  syncModeResolver?.(mode);
  syncModeResolver = null;
}

export function createListSyncHandlers() {
  return {
    async getEnabledFeatures(
      _socket: unknown,
      serverType: string,
      supported: { list?: number; dislike?: number },
    ) {
      const features: Record<string, { skipSnapshot: boolean }> = {};
      if (supported.list === SYNC_FEATURE_VERSION.list) {
        features.list = { skipSnapshot: false };
      }
      if (supported.dislike === SYNC_FEATURE_VERSION.dislike) {
        features.dislike = { skipSnapshot: false };
      }
      void serverType;
      return features;
    },

    async finished() {
      // server signals sync complete
    },

    async onListSyncAction(_socket: unknown, payload: LxSyncActionPayload) {
      if (!listSyncReady) return;
      await handleLxListAction(payload.action, payload.data);
    },

    async list_sync_get_md5() {
      return getLxListDataMd5(await getLocalLxListData());
    },

    async list_sync_get_sync_mode() {
      const cfg = await loadLxSyncConfig();
      return (cfg.syncMode as LxSyncMode) ?? 'merge_local_remote';
    },

    async list_sync_get_list_data() {
      return getLocalLxListData();
    },

    async list_sync_set_list_data(data: Parameters<typeof setLocalLxListData>[0]) {
      await setLocalLxListData(data);
    },

    async list_sync_finished() {
      listSyncReady = true;
    },

    async onDislikeSyncAction(_socket: unknown, payload: LxSyncActionPayload) {
      if (!dislikeSyncReady) return;
      await handleLxDislikeAction(payload.action, payload.data);
    },

    async dislike_sync_get_md5() {
      return getLxDislikeMd5(await getLocalLxDislikeData());
    },

    async dislike_sync_get_sync_mode() {
      const cfg = await loadLxSyncConfig();
      return (cfg.syncMode as LxSyncMode) ?? 'merge_local_remote';
    },

    async dislike_sync_get_list_data() {
      return getLocalLxDislikeData();
    },

    async dislike_sync_set_list_data(data: string) {
      await setLocalLxDislikeData(data);
    },

    async dislike_sync_finished() {
      dislikeSyncReady = true;
    },
  };
}

export function resetSyncHandlerState(): void {
  listSyncReady = false;
  dislikeSyncReady = false;
}
