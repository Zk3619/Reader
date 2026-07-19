/**
 * 启动时：将 settings/localStorage 中的音频搜索历史与 UserApi 脚本镜像进 SQLite（幂等）
 */

import type { DatabaseAdapter } from '@/lib/platform/database';
import { upsertAudioSource } from '@/lib/database/audio-sources';
import { importAudioSearchHistoryWords } from '@/lib/database/module-search-keywords';
import { AudioTables } from '@/lib/database/table-names';
import { tableExists } from '@/lib/database/core/migration-helpers';

export async function migrateAudioSettingsIntoDb(db: DatabaseAdapter): Promise<void> {
  if (!(await tableExists(db, AudioTables.sources))) return;
  if (!(await tableExists(db, AudioTables.searchKeywords))) return;

  try {
    const { getMusicConfigCache, warmMusicConfigCache } = await import(
      '@/lib/media/audio/music-config-storage'
    );
    await warmMusicConfigCache();
    const snap = getMusicConfigCache();
    if (Array.isArray(snap.searchHistory) && snap.searchHistory.length > 0) {
      await importAudioSearchHistoryWords(snap.searchHistory);
    }
  } catch (error) {
    console.warn('[数据库] 音频搜索历史迁入失败:', error);
  }

  try {
    const { listUserApiScripts } = await import(
      '@/lib/media/audio/online/user-api-engine'
    );
    const scripts = listUserApiScripts();
    let order = 100;
    for (const s of scripts) {
      await upsertAudioSource({
        id: s.id,
        kind: 'user_api',
        name: s.name || s.id,
        enabled: Boolean(s.enabled),
        script: typeof s.script === 'string' ? s.script : undefined,
        version: typeof s.version === 'string' ? s.version : undefined,
        customOrder: order++,
        metaJson: JSON.stringify({
          allowShowUpdateAlert: s.allowShowUpdateAlert ?? true,
        }),
      });
    }
  } catch (error) {
    console.warn('[数据库] UserApi 源迁入失败:', error);
  }
}
