/**
 * reader.ui：阅读器 UI 配置接入统一管线（权威仍为 getStorage reader_ui_config_v1）
 * critical：首屏前 hydrate，与 index.tsx warm 对齐，不依赖挂载阅读器。
 */

import type { PersistDomain } from '@/lib/persistence/types';
import { registerPersistDomain } from '@/lib/persistence/registry';
import { warmReaderUiConfigCache } from '@/lib/media/text/read-config-storage';
import { applyPersistedReaderUiConfig } from '@/stores/viewer/media/text';

export const READER_UI_DOMAIN_ID = 'reader.ui';
export const READER_UI_VERSION = 1;

export function createReaderUiPersistDomain(): PersistDomain {
  return {
    id: READER_UI_DOMAIN_ID,
    version: READER_UI_VERSION,
    priority: 'critical',
    hydrate: async () => {
      await warmReaderUiConfigCache().catch(() => undefined);
      applyPersistedReaderUiConfig();
    },
    // 变更仍由 read-config-storage / viewer text store 即时写入 getStorage
    persist: async () => {},
    flush: async () => {},
    exportSnapshot: async () => ({ version: READER_UI_VERSION, note: 'reader_ui_config_v1' }),
  };
}

export function registerReaderUiPersistDomain(): void {
  registerPersistDomain(createReaderUiPersistDomain());
}
