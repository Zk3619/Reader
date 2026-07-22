/**
 * 标题栏歌词（对齐 any-listen titleLyric → setTitle）
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/platform/detect';
import { getMusicSettings } from '@/lib/media/audio/music-settings';

const DEFAULT_TITLE = 'Reader';
let lastTitle = '';
let restored = true;

async function applyTitle(title: string): Promise<void> {
  if (title === lastTitle) return;
  lastTitle = title;
  if (isTauri()) {
    try {
      await getCurrentWindow().setTitle(title);
      return;
    } catch {
      // fall through to document.title
    }
  }
  if (typeof document !== 'undefined') {
    document.title = title;
  }
}

/** 播放中更新窗口标题；关闭设置或无歌词时回落到「歌名 - 歌手」或默认标题 */
export async function syncMusicTitleLyric(options: {
  playing: boolean;
  trackName?: string | null;
  trackArtist?: string | null;
  lyricLine?: string | null;
}): Promise<void> {
  const enabled = getMusicSettings().showTitleLyric === true;
  if (!enabled) {
    if (!restored) {
      restored = true;
      lastTitle = '';
      await applyTitle(DEFAULT_TITLE);
    }
    return;
  }

  restored = false;
  const line = options.lyricLine?.trim() ?? '';
  const meta = [options.trackName, options.trackArtist].filter(Boolean).join(' - ');
  if (options.playing && line) {
    await applyTitle(line.length > 80 ? `${line.slice(0, 80)}…` : line);
    return;
  }
  if (meta) {
    await applyTitle(meta.length > 80 ? `${meta.slice(0, 80)}…` : meta);
    return;
  }
  await applyTitle(DEFAULT_TITLE);
}

export async function restoreDefaultWindowTitle(): Promise<void> {
  restored = true;
  lastTitle = '';
  await applyTitle(DEFAULT_TITLE);
}
