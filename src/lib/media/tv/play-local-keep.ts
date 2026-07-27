/**
 * 收藏/历史中的本地（含 WebDAV HTTP URL）条目播放
 */

import { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';
import { formatPlaybackToastDescription } from '@/lib/media/video/playback/mpv-launch';
import { showAppToast } from '@/components/shared/AppToasts';

export function resolveLocalKeepSourceKind(pathOrUrl: string): 'file' | 'webdav' {
  const u = pathOrUrl.trim();
  if (/^https?:\/\//i.test(u)) return 'webdav';
  return 'file';
}

export async function playLocalKeepMedia(opts: {
  pathOrUrl: string;
  title?: string;
  startSec?: number;
}): Promise<void> {
  const url = opts.pathOrUrl.trim();
  if (!url) {
    void showAppToast({ title: '无法播放', description: '缺少本地路径', variant: 'warning' });
    return;
  }
  const sourceKind = resolveLocalKeepSourceKind(url);
  try {
    if (sourceKind === 'file') {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('video_allow_local_media_asset', { path: url });
      } catch {
        /* */
      }
    }
    const kind = await openRoutedPlayback(url, {
      title: opts.title,
      sourceKind,
      startSec: opts.startSec,
    });
    void showAppToast({
      title: '已开始播放',
      description: formatPlaybackToastDescription(kind, opts.title || url),
      variant: 'success',
    });
  } catch (e) {
    void showAppToast({
      title: '播放失败',
      description: e instanceof Error ? e.message : String(e),
      variant: 'error',
    });
  }
}
