/**
 * 外置播放器：mpv / VLC / 系统默认（桌面）
 * E1：mpv/VLC 深度参数交接；IPC 进度尽力（见 video_mpv_ipc_get_time_pos）
 */

import {
  buildExternalMpvArgsAsync,
  buildExternalVlcArgs,
} from '@/lib/media/video/playback/external-mpv';
import {
  getVideoPlaybackPrefs,
  setVideoPlaybackPrefs,
  type ExternalPlayerKindPref,
} from '@/lib/media/video/playback/prefs';
import type { PlaybackLoadOptions } from '@/lib/media/video/playback/types';

export type ExternalPlayerKind = ExternalPlayerKindPref;

const STORAGE_KEY = 'reader.tv.externalPlayer';

export function getPreferredExternalPlayer(): ExternalPlayerKind {
  try {
    const fromPrefs = getVideoPlaybackPrefs().externalKind;
    if (fromPrefs === 'mpv' || fromPrefs === 'vlc' || fromPrefs === 'system') {
      return fromPrefs;
    }
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'mpv' || v === 'vlc' || v === 'system') return v;
  } catch {
    /* */
  }
  return 'system';
}

export function setPreferredExternalPlayer(kind: ExternalPlayerKind): void {
  try {
    localStorage.setItem(STORAGE_KEY, kind);
    setVideoPlaybackPrefs({ externalKind: kind });
  } catch {
    /* */
  }
}

export type OpenExternalOptions = Partial<PlaybackLoadOptions> & {
  kind?: ExternalPlayerKind;
};

/** 用外置播放器打开直链；失败时抛错。返回 mpv IPC 路径（若有） */
export async function openInExternalPlayer(
  url: string,
  kindOrOpts:
    | ExternalPlayerKind
    | OpenExternalOptions = getPreferredExternalPlayer(),
): Promise<{ ipcPath: string | null }> {
  if (!url?.trim()) throw new Error('无播放地址');

  const opts: OpenExternalOptions =
    typeof kindOrOpts === 'string' ? { kind: kindOrOpts } : kindOrOpts;
  const kind = opts.kind ?? getPreferredExternalPlayer();

  if (kind === 'system') {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return { ipcPath: null };
  }

  const { Command } = await import('@tauri-apps/plugin-shell');
  if (kind === 'vlc') {
    const args = buildExternalVlcArgs(url, opts.subtitle);
    const cmd = Command.create('vlc', args);
    await cmd.spawn();
    return { ipcPath: null };
  }

  const { args, ipcPath } = await buildExternalMpvArgsAsync(url, opts);
  const cmd = Command.create('mpv', args);
  await cmd.spawn();
  return { ipcPath };
}
