/**
 * 外置播放器：mpv / VLC / 系统默认 / 自定义 exe（桌面）
 * E1：mpv/VLC 深度参数交接；IPC 进度尽力（见 video_mpv_ipc_get_time_pos）
 */

import {
  buildExternalMpvArgsAsync,
  buildExternalVlcArgs,
} from '@/lib/media/video/playback/external-mpv';
import { resolvePlaybackMediaUrl } from '@/lib/media/video/playback/media-url';
import {
  externalCustomKind,
  getVideoPlaybackPrefs,
  isExternalPlayerBuiltin,
  parseExternalCustomId,
  setVideoPlaybackPrefs,
  type ExternalPlayerKindPref,
  type ExternalPlayerPreset,
} from '@/lib/media/video/playback/prefs';
import type { PlaybackLoadOptions } from '@/lib/media/video/playback/types';

export type ExternalPlayerKind = ExternalPlayerKindPref;

const STORAGE_KEY = 'reader.tv.externalPlayer';

/**
 * 是否走 openUrl（http(s)/mailto 等）。
 * 注意：Windows 盘符 `J:\...` 会被裸 scheme 正则误判，必须先排除。
 */
export function isRemoteOrAppSchemeUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/^[A-Za-z]:[\\/]/.test(u) || u.startsWith('\\\\')) return false;
  if (/^file:/i.test(u)) return false;
  return /^[a-z][a-z0-9+.-]*:/i.test(u);
}

export function getPreferredExternalPlayer(): ExternalPlayerKind {
  try {
    const prefs = getVideoPlaybackPrefs();
    return resolveExternalPlayerSelection(prefs.externalKind, prefs);
  } catch {
    /* */
  }
  return 'system';
}

export function setPreferredExternalPlayer(kind: ExternalPlayerKind): void {
  try {
    if (isExternalPlayerBuiltin(kind)) {
      localStorage.setItem(STORAGE_KEY, kind);
    } else {
      localStorage.setItem(STORAGE_KEY, 'custom');
    }
    setVideoPlaybackPrefs({ externalKind: kind });
  } catch {
    /* */
  }
}

export function listExternalPlayerOptions(
  prefs = getVideoPlaybackPrefs(),
): {
  value: ExternalPlayerKind;
  label: string;
}[] {
  const builtins: { value: ExternalPlayerKind; label: string }[] = [
    { value: 'system', label: '系统默认' },
    { value: 'mpv', label: 'mpv（需在 PATH）' },
    { value: 'vlc', label: 'VLC（需在 PATH）' },
  ];
  const customs = prefs.externalPresets.map((p) => ({
    value: externalCustomKind(p.id) as ExternalPlayerKind,
    label: p.name,
  }));
  return [...builtins, ...customs];
}

/** 若当前选择指向已删除预设，回落为 system */
export function resolveExternalPlayerSelection(
  kind: string,
  prefs = getVideoPlaybackPrefs(),
): ExternalPlayerKind {
  if (isExternalPlayerBuiltin(kind)) return kind;
  const id = parseExternalCustomId(kind);
  if (id && prefs.externalPresets.some((p) => p.id === id)) {
    return `custom:${id}`;
  }
  return 'system';
}

export function addExternalPlayerPreset(input: {
  name: string;
  exePath: string;
  extraArgs?: string[];
}): ExternalPlayerPreset {
  const name = input.name.trim() || exeBaseName(input.exePath) || '自定义播放器';
  const exePath = input.exePath.trim();
  if (!exePath) throw new Error('请选择播放器可执行文件');
  const preset: ExternalPlayerPreset = {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    exePath,
    extraArgs: (input.extraArgs ?? []).map((a) => a.trim()).filter(Boolean),
  };
  const prefs = getVideoPlaybackPrefs();
  setVideoPlaybackPrefs({
    externalPresets: [...prefs.externalPresets, preset],
    externalKind: externalCustomKind(preset.id),
  });
  setPreferredExternalPlayer(externalCustomKind(preset.id));
  return preset;
}

export function removeExternalPlayerPreset(id: string): void {
  const prefs = getVideoPlaybackPrefs();
  const next = prefs.externalPresets.filter((p) => p.id !== id);
  const kind =
    prefs.externalKind === externalCustomKind(id) ? 'system' : prefs.externalKind;
  setVideoPlaybackPrefs({ externalPresets: next, externalKind: kind });
  if (kind === 'system' || isExternalPlayerBuiltin(kind)) {
    setPreferredExternalPlayer(kind);
  }
}

function exeBaseName(path: string): string {
  const leaf = path.split(/[/\\]/).pop() || '';
  return leaf.replace(/\.(exe|com|bat|cmd)$/i, '') || leaf;
}

export type OpenExternalOptions = Partial<PlaybackLoadOptions> & {
  kind?: ExternalPlayerKind;
};

async function spawnCustomPlayer(
  preset: ExternalPlayerPreset,
  media: string,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const args = [...preset.extraArgs, media];
  await invoke('video_spawn_external_player', {
    exe: preset.exePath,
    args,
  });
}

function pathNotFoundHint(kind: 'mpv' | 'vlc', err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  return new Error(
    `找不到 ${kind}（未安装，或未加入系统 PATH）。可改用「系统默认」、添加自定义播放器路径，或将 ${kind}.exe 所在目录加入 PATH。\n${raw}`,
  );
}

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
  // file:// / StorageRef → 本机路径；http(s) 等保持原样
  const media = resolvePlaybackMediaUrl(url) || url.trim();

  const customId = parseExternalCustomId(kind);
  if (customId) {
    const preset = getVideoPlaybackPrefs().externalPresets.find(
      (p) => p.id === customId,
    );
    if (!preset) throw new Error('自定义播放器预设不存在或已删除');
    await spawnCustomPlayer(preset, media);
    return { ipcPath: null };
  }

  if (kind === 'system') {
    // shell.open 默认只允许 mailto/tel/http(s)；本地路径用 opener.openPath
    const { openPath, openUrl } = await import('@tauri-apps/plugin-opener');
    if (isRemoteOrAppSchemeUrl(media)) {
      await openUrl(media);
    } else {
      await openPath(media);
    }
    return { ipcPath: null };
  }

  const { Command } = await import('@tauri-apps/plugin-shell');
  if (kind === 'vlc') {
    const args = buildExternalVlcArgs(media, opts.subtitle);
    try {
      await Command.create('vlc', args).spawn();
    } catch (e) {
      throw pathNotFoundHint('vlc', e);
    }
    return { ipcPath: null };
  }

  const { args, ipcPath } = await buildExternalMpvArgsAsync(media, opts);
  try {
    await Command.create('mpv', args).spawn();
  } catch (e) {
    throw pathNotFoundHint('mpv', e);
  }
  return { ipcPath };
}
