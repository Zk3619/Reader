/**
 * LiveApi
 */

import * as LiveConfig from './config/live-config';
import * as VodConfig from './config/vod-config';
import { loadLiveGroups, flattenChannels } from './live/parser';
import type { LiveChannel, LiveGroup, LiveSource } from './types';

export async function listLiveSources(): Promise<LiveSource[]> {
  // 已配置独立直播源（含从 Vod 同步）时以 LiveConfig 为准
  if (LiveConfig.getLiveConfigUrl()) {
    return LiveConfig.getLiveSources();
  }
  return VodConfig.getLives();
}

export async function loadLive(sourceName?: string): Promise<{
  source: LiveSource;
  groups: LiveGroup[];
  channels: Array<LiveChannel & { group: string }>;
}> {
  const lives = await listLiveSources();
  const source =
    (sourceName ? lives.find((l) => l.name === sourceName) : lives[0]) ??
    ({ name: 'empty', groups: [] } as LiveSource);
  const groups = await loadLiveGroups(source);
  return { source, groups, channels: flattenChannels(groups) };
}
