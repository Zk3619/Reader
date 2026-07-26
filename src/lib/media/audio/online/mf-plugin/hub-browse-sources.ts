/**
 * Hub 歌单/排行榜浏览源（LX 五源 + 平台源 + MusicFree 插件）
 */

import {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
} from '@/lib/media/audio/music-sdk';
import type { HubBrowseSource } from '@/lib/media/audio/music-sdk/types';
import { listMfPluginsWithAbility } from '@/lib/media/audio/online/mf-plugin/browse';
import { mfPluginDisplayLabel } from '@/lib/media/audio/online/mf-plugin';
import { isMfSourceKey, mfSourceKey, parseMfPluginId } from '@/lib/media/audio/online/mf-plugin/types';
import {
  PLATFORM_SOURCES,
  PLATFORM_SOURCE_LABELS,
  isPlatformSource,
} from '@/lib/media/audio/platform/platform-sources';

export type { HubBrowseSource };

export function isHubMfSource(source: string): source is `mf:${string}` {
  return isMfSourceKey(source);
}

export function hubMfPluginId(source: HubBrowseSource): string | null {
  return isHubMfSource(source) ? parseMfPluginId(source) : null;
}

export function listHubSongListSources(): HubBrowseSource[] {
  const mfs = listMfPluginsWithAbility('getRecommendSheetTags').map(
    (p) => mfSourceKey(p.id) as HubBrowseSource,
  );
  // B 站无公开发现/歌单流（收藏夹走「我的列表」账号同步），不进歌单浏览下拉
  const platforms = PLATFORM_SOURCES.filter((s) => s !== 'bili');
  return [...MUSIC_SDK_SOURCES, ...platforms, ...mfs] as HubBrowseSource[];
}

export function listHubLeaderboardSources(): HubBrowseSource[] {
  const mfs = listMfPluginsWithAbility('getTopLists').map(
    (p) => mfSourceKey(p.id) as HubBrowseSource,
  );
  return [...MUSIC_SDK_SOURCES, ...mfs];
}

export function hubBrowseSourceLabel(source: HubBrowseSource): string {
  if (isHubMfSource(source)) {
    const id = parseMfPluginId(source);
    return id ? mfPluginDisplayLabel(id) : source;
  }
  if (isPlatformSource(source)) {
    return PLATFORM_SOURCE_LABELS[source];
  }
  return MUSIC_SDK_SOURCE_LABELS[source as keyof typeof MUSIC_SDK_SOURCE_LABELS] ?? source;
}
