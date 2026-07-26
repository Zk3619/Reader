/**
 * 在线歌词统一解析
 */

import type { AudioTrack } from '@/lib/media/audio/track-types';
import type { LyricBundle } from '@/lib/media/audio/lyric-types';
import {
  hasLyricContent,
  hasLxWordTags,
  pickLyricText,
} from '@/lib/media/audio/lyric-types';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { findMusic } from '@/lib/media/audio/music-sdk/find-music';
import * as kw from '@/lib/media/audio/online/sources/kw';
import * as wy from '@/lib/media/audio/online/sources/wy';
import * as kg from '@/lib/media/audio/online/sources/kg';
import * as tx from '@/lib/media/audio/online/sources/tx';
import * as mg from '@/lib/media/audio/online/sources/mg';
import { userApiLyric } from '@/lib/media/audio/online/user-api-engine';
import { getToggleMusicInfo } from '@/lib/media/audio/track-toggle';
import {
  cacheResolvedLyricBundle,
  getCachedLyricBundle,
} from '@/lib/database/audio-lyric-cache';

async function resolveBuiltinLyric(track: AudioTrack): Promise<LyricBundle | null> {
  switch (track.source) {
    case 'kw':
      return kw.kwGetLyric(track);
    case 'wy':
      return wy.wyGetLyric(track);
    case 'kg':
      return kg.kgGetLyric(track);
    case 'tx':
      return tx.txGetLyric(track);
    case 'mg':
      return mg.mgGetLyric(track);
    case 'netease': {
      const { getNeteaseLyricBundle } = await import('@/lib/media/audio/platform/api/netease');
      return getNeteaseLyricBundle(track);
    }
    case 'ytm': {
      const { getYtmLyricBundle } = await import('@/lib/media/audio/platform/api/ytm');
      return getYtmLyricBundle(track);
    }
    case 'bili': {
      // 无原生歌词：由上层 LRCLIB / findMusic 补全
      return null;
    }
    default:
      return null;
  }
}

function bundleHasLx(bundle: LyricBundle | null | undefined): boolean {
  return hasLxWordTags(bundle?.lxlyric);
}

/**
 * 拉取歌词（不含持久化）：开启卡拉 OK 时优先拿到带逐字标签的 bundle（可跨平台补全）。
 */
export async function fetchOnlineLyricBundle(
  track: AudioTrack,
  options?: { skipLinkLyric?: boolean },
): Promise<LyricBundle | null> {
  if (track.source === 'userApi') {
    const userApiId = track.meta.userApiId;
    if (typeof userApiId !== 'string') return null;
    const lyric = await userApiLyric(userApiId, track);
    return lyric ? { lyric } : null;
  }

  const { isMfSourceKey, parseMfPluginId } = await import(
    '@/lib/media/audio/online/mf-plugin/types'
  );
  if (isMfSourceKey(String(track.source))) {
    const pluginId =
      parseMfPluginId(String(track.source)) ||
      (typeof track.meta.mfPluginId === 'string' ? track.meta.mfPluginId : null);
    if (!pluginId) return null;
    const { mfGetLyric } = await import('@/lib/media/audio/online/mf-plugin');
    return mfGetLyric(pluginId, track);
  }

  const { getLinkedLyricRef, linkedLyricRefToTrack } = await import(
    '@/lib/media/audio/link-lyric'
  );
  if (!options?.skipLinkLyric) {
    const linked = getLinkedLyricRef(track);
    if (linked) {
      const linkedTrack = linkedLyricRefToTrack(linked, track);
      const linkedBundle = await fetchOnlineLyricBundle(linkedTrack, { skipLinkLyric: true });
      if (linkedBundle && (linkedBundle.lyric || linkedBundle.tlyric)) {
        return linkedBundle;
      }
    }
  }

  const preferLx = getMusicSettings().lyricUseLxLyric !== false;
  const allowFallback = getMusicSettings().fallbackLyric !== false;

  let best: LyricBundle | null = null;

  const consider = (bundle: LyricBundle | null) => {
    if (!hasLyricContent(bundle)) return false;
    if (!best) best = bundle;
    else if (preferLx && bundleHasLx(bundle) && !bundleHasLx(best)) best = bundle;
    return preferLx ? bundleHasLx(bundle) : true;
  };

  // 手动/自动换源挂载的备用曲目：优先尝试（对齐 lx 换源后仍可拉歌词）
  const toggle = getToggleMusicInfo(track);
  if (toggle && consider(await resolveBuiltinLyric(toggle))) return best;

  // 本地曲：消费播放链路写入的 matchedOnline*（无 toggle 时补挂）
  if (track.source === 'local' && getMusicSettings().autoMatchLocalOnline !== false) {
    try {
      const { enrichLocalTrackOnlineMeta } = await import(
        '@/lib/media/audio/library/local-online-match'
      );
      const enriched = await enrichLocalTrackOnlineMeta(track);
      const matchedToggle = getToggleMusicInfo(enriched);
      if (matchedToggle && consider(await resolveBuiltinLyric(matchedToggle))) return best;
    } catch {
      // ignore
    }
  }

  if (consider(await resolveBuiltinLyric(track))) return best;

  // 外挂：LRCLIB → QQ 仅补（不取播链），再 findMusic 他源
  if (allowFallback) {
    try {
      const { fetchLrclibLyric, fetchQqEnrichLyric } = await import(
        '@/lib/media/audio/online/meta-enrich'
      );
      if (consider(await fetchLrclibLyric(track))) return best;
      if (consider(await fetchQqEnrichLyric(track))) return best;
    } catch {
      // ignore
    }

    try {
      const others = await findMusic(track);
      for (const alt of others) {
        if (consider(await resolveBuiltinLyric(alt))) return best;
      }
    } catch {
      // ignore
    }
  }

  const { getMfGlobalSettings } = await import(
    '@/lib/media/audio/online/mf-plugin/global-settings'
  );
  if (getMfGlobalSettings().autoSearchLyric && !options?.skipLinkLyric) {
    const { listMfSearchPlugins, mfSearch } = await import(
      '@/lib/media/audio/online/mf-plugin'
    );
    const q = [track.name, track.artist].filter(Boolean).join(' ').trim();
    if (q) {
      for (const p of listMfSearchPlugins()) {
        if (!p.supportedSearchType?.includes('lyric') && p.supportedSearchType?.length) continue;
        try {
          const hit = await mfSearch(p.id, q, 1, 'lyric');
          const candidate = hit.tracks[0];
          if (!candidate) continue;
          const bundle = await fetchOnlineLyricBundle(candidate, { skipLinkLyric: true });
          if (bundle && hasLyricContent(bundle)) return bundle;
        } catch {
          // try next plugin
        }
      }
    }
  }

  return best;
}

/**
 * 拉取歌词：优先读本地持久化缓存，未命中再在线解析并写入。
 */
export async function resolveOnlineLyricBundle(track: AudioTrack): Promise<LyricBundle | null> {
  const trackId = track.id?.trim();
  if (trackId) {
    try {
      const cached = await getCachedLyricBundle(trackId);
      if (cached) {
        // 已解析过（含空结果）：直接返回，避免每次播放重复全平台搜索
        return hasLyricContent(cached) || cached.rlyric?.trim() ? cached : null;
      }
    } catch {
      // 缓存读失败则继续在线拉取
    }
  }

  const bundle = await fetchOnlineLyricBundle(track);
  if (trackId) {
    void cacheResolvedLyricBundle(trackId, bundle).catch(() => undefined);
  }
  return bundle;
}

export async function resolveOnlineLyricText(track: AudioTrack): Promise<string | null> {
  const bundle = await resolveOnlineLyricBundle(track);
  const kind = getMusicSettings().lyricTrack;
  return pickLyricText(bundle, kind);
}
