/**
 * 蜂窝网络播放/下载守卫（对齐 MusicFree basic.useCelluarNetworkPlay/Download）
 * 另：cellularForceLowestQuality 与拦截正交
 */

import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { isCellularNetwork } from '@/lib/platform/network';
import { isAndroid, isMobile } from '@/lib/platform/detect';
import { showAppToast } from '@/components/shared/AppToasts';
import type { AudioTrack } from '@/lib/media/audio/track-types';

const CELLULAR_HUB_WARNING_TOAST_ID = 'music-cellular-hub-warning';

let cellularHubWarningShown = false;

export type CellularBlockReason = 'play' | 'download';

function isLocalTrack(track?: AudioTrack | null): boolean {
  if (!track) return false;
  return track.source === 'local' || Boolean(track.meta?.filePath);
}

/** 蜂窝流量限制仅对移动端有意义（与播放设置 UI 一致） */
function isCellularGuardPlatform(): boolean {
  return isMobile() || isAndroid();
}

export function shouldBlockCellularAction(
  reason: CellularBlockReason,
  opts?: { track?: AudioTrack | null },
): boolean {
  if (!isCellularGuardPlatform()) return false;
  if (!isCellularNetwork()) return false;
  if (reason === 'play' && isLocalTrack(opts?.track)) return false;
  const settings = getMusicSettings();
  if (reason === 'play') return !settings.useCellularNetworkPlay;
  return !settings.useCellularNetworkDownload;
}

/** 允许播放时，蜂窝下仍可强制最低音质 */
export function shouldForceCellularLowestQuality(): boolean {
  if (!isCellularGuardPlatform()) return false;
  if (!isCellularNetwork()) return false;
  return getMusicSettings().cellularForceLowestQuality !== false;
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

function shouldShowCellularHubWarning(): boolean {
  if (!isCellularGuardPlatform()) return false;
  if (!isCellularNetwork()) return false;
  const settings = getMusicSettings();
  return !settings.useCellularNetworkPlay || !settings.useCellularNetworkDownload;
}

/** Hub 进入移动网络时的主动提示（原页面顶部横幅，现改为 warning Toast） */
export function maybeShowCellularHubWarningToast(): void {
  if (cellularHubWarningShown) return;
  if (!shouldShowCellularHubWarning()) return;
  cellularHubWarningShown = true;
  showAppToast({
    id: CELLULAR_HUB_WARNING_TOAST_ID,
    title: '当前为移动网络',
    description: '在线播放与下载可能已被限制。可在播放设置中允许使用移动网络。',
    variant: 'warning',
    duration: 8000,
  });
}
