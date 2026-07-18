/**
 * LiveApi
 */

import * as VodConfig from './config/vod-config';
import { loadLiveGroups, flattenChannels } from './live/parser';
import type { LiveChannel, LiveGroup, LiveSource } from './types';

export async function listLiveSources(): Promise<LiveSource[]> {
  return VodConfig.getLives();
}

export async function loadLive(sourceName?: string): Promise<{
  source: LiveSource;
  groups: LiveGroup[];
  channels: Array<LiveChannel & { group: string }>;
}> {
  const lives = VodConfig.getLives();
  const source =
    (sourceName ? lives.find((l) => l.name === sourceName) : lives[0]) ??
    ({ name: 'empty', groups: [] } as LiveSource);
  const groups = await loadLiveGroups(source);
  return { source, groups, channels: flattenChannels(groups) };
}
