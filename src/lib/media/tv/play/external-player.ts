/**
 * 外置播放器：mpv / VLC / 系统默认（桌面）
 */

export type ExternalPlayerKind = 'mpv' | 'vlc' | 'system';

const STORAGE_KEY = 'reader.tv.externalPlayer';

export function getPreferredExternalPlayer(): ExternalPlayerKind {
  try {
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
  } catch {
    /* */
  }
}

/** 用外置播放器打开直链；失败时抛错 */
export async function openInExternalPlayer(
  url: string,
  kind: ExternalPlayerKind = getPreferredExternalPlayer(),
): Promise<void> {
  if (!url?.trim()) throw new Error('无播放地址');
  if (kind === 'system') {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return;
  }
  const { Command } = await import('@tauri-apps/plugin-shell');
  const cmdName = kind === 'mpv' ? 'mpv' : 'vlc';
  const cmd = Command.create(cmdName, [url]);
  const out = await cmd.spawn();
  // fire-and-forget；spawn 失败会抛
  void out;
}
