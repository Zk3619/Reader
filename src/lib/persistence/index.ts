/**
 * 统一持久化管线入口：注册域 + boot hydrate/flush
 */

import {
  hydrateCritical,
  hydrateDeferred,
  installPersistenceFlushListeners,
} from '@/lib/persistence/registry';
import { registerMusicConfigPersistDomain } from '@/lib/persistence/domains/music-config';
import { registerMusicSessionPersistDomain } from '@/lib/persistence/domains/music-session';
import { registerMusicUiPersistDomain } from '@/lib/persistence/domains/music-ui';
import { registerShellTabsPersistDomain } from '@/lib/persistence/domains/shell-tabs';
import { registerReaderUiPersistDomain } from '@/lib/persistence/domains/reader-ui';
import { registerTvSessionPersistDomain } from '@/lib/persistence/domains/tv-session';
import { registerTvConfigPersistDomain } from '@/lib/persistence/domains/tv-config';
import { registerSubscribeSessionPersistDomain } from '@/lib/persistence/domains/subscribe-session';

/** hydrate 前绑定 apply/capture / music settings normalizer（副作用导入） */
import '@/lib/media/audio/music-settings';
import '@/stores/shell-tabs';
import '@/stores/tv-hub/section';
import '@/stores/subscribe-hub/section';
import {
  applyDefaultParseNameFromPersist,
  captureDefaultParseName,
} from '@/lib/media/tv/config/vod-config';
import { bindTvUiPersistAppliers } from '@/lib/persistence/domains/tv-config';

bindTvUiPersistAppliers({
  applyDefaultParse: applyDefaultParseNameFromPersist,
  captureDefaultParse: captureDefaultParseName,
});

let bootstrapped = false;

/** 注册全部已知域（幂等） */
export function bootstrapPersistenceRegistry(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  registerReaderUiPersistDomain();
  registerShellTabsPersistDomain();
  registerMusicConfigPersistDomain();
  registerMusicSessionPersistDomain();
  registerMusicUiPersistDomain();
  registerTvSessionPersistDomain();
  registerTvConfigPersistDomain();
  registerSubscribeSessionPersistDomain();
  installPersistenceFlushListeners();
}

export async function runPersistenceHydrateCritical(): Promise<void> {
  bootstrapPersistenceRegistry();
  await hydrateCritical();
}

/** 须在 initDatabase 成功后调用 */
export async function runPersistenceHydrateDeferred(): Promise<void> {
  bootstrapPersistenceRegistry();
  await hydrateDeferred();
}

export {
  ensureHydrated,
  flushAll,
  persistDomain,
  dumpPersistDomains,
  importPersistDomains,
  isPersistDomainHydrated,
} from '@/lib/persistence/registry';
