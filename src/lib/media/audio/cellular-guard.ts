/**
 * 蜂窝网络播放/下载守卫（对齐 MusicFree basic.useCelluarNetworkPlay/Download）
 */

import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { isCellularNetwork } from '@/lib/platform/network';
import { showAppToast } from '@/components/shared/AppToasts';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export type CellularBlockReason = 'play' | 'download';

function isLocalTrack(track?: AudioTrack | null): boolean {
  if (!track) return false;
  return track.source === 'local' || Boolean(track.meta?.filePath);
}

export function shouldBlockCellularAction(
  reason: CellularBlockReason,
  opts?: { track?: AudioTrack | null },
): boolean {
  if (!isCellularNetwork()) return false;
  if (reason === 'play' && isLocalTrack(opts?.track)) return false;
  const settings = getMusicSettings();
  if (reason === 'play') return !settings.useCellularNetworkPlay;
  return !settings.useCellularNetworkDownload;
}

export function showCellularBlockedToast(reason: CellularBlockReason): void {
  const title =
    reason === 'play'
      ? '当前为移动网络，已禁止在线播放'
      : '当前为移动网络，已禁止下载';
  showAppToast({
    title,
    description: '可在「播放设置」中开启「使用移动网络播放/下载」',
    variant: 'warning',
    duration: 5000,
  });
}

export function guardCellularAction(
  reason: CellularBlockReason,
  opts?: { track?: AudioTrack | null },
): boolean {
  if (!shouldBlockCellularAction(reason, opts)) return false;
  showCellularBlockedToast(reason);
  return true;
}
