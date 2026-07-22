/**
 * Hub 歌单/排行榜浏览源（LX 五源 + MusicFree 插件）
 */

import {
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
} from '@/lib/media/audio/music-sdk';
import type { HubBrowseSource } from '@/lib/media/audio/music-sdk/types';
import { listMfPluginsWithAbility } from '@/lib/media/audio/online/mf-plugin/browse';
import { mfPluginDisplayLabel } from '@/lib/media/audio/online/mf-plugin';
import { isMfSourceKey, mfSourceKey, parseMfPluginId } from '@/lib/media/audio/online/mf-plugin/types';

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
  return [...MUSIC_SDK_SOURCES, ...mfs];
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
  return MUSIC_SDK_SOURCE_LABELS[source] ?? source;
}
