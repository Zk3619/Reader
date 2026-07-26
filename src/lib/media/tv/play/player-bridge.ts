/**
 * 当前影视 Artplayer 实例桥（LOCAL control /media / danmaku）
 */

import type Artplayer from 'artplayer';

let current: Artplayer | null = null;
const playingListeners = new Set<() => void>();

function notifyPlaying(): void {
  for (const cb of playingListeners) cb();
}

function bindPlayingEvents(art: Artplayer | null): void {
  if (!art) return;
  const bump = () => notifyPlaying();
  art.on('play', bump);
  art.on('pause', bump);
  art.on('video:play', bump);
  art.on('video:pause', bump);
}

export function registerTvPlayer(art: Artplayer | null): void {
  current = art;
  bindPlayingEvents(art);
  notifyPlaying();
}

export function getTvPlayer(): Artplayer | null {
  return current;
}

export function subscribeTvPlayerPlaying(cb: () => void): () => void {
  playingListeners.add(cb);
  return () => playingListeners.delete(cb);
}

export function tvPlayerIsPlaying(): boolean {
  const art = current;
  if (!art) return false;
  try {
    const video = art.video as HTMLVideoElement | undefined;
    if (video) return !video.paused && !video.ended;
  } catch {
    /* */
  }
  return !!art.playing;
}

export function controlTvPlayer(type: string): boolean {
  const art = current;
  if (!art) return false;
  switch (type) {
    case 'play':
      void art.play();
      notifyPlaying();
      return true;
    case 'pause':
      art.pause();
      notifyPlaying();
      return true;
    case 'stop':
      art.pause();
      art.currentTime = 0;
      notifyPlaying();
      return true;
    case 'replay':
      art.currentTime = 0;
      void art.play();
      notifyPlaying();
      return true;
    case 'toggle': {
      // 以 video.paused 为准；art.playing 在部分状态下会滞后，导致小窗按钮“点了没反应”
      let paused = true;
      try {
        const video = art.video as HTMLVideoElement | undefined;
        if (video) paused = video.paused || video.ended;
        else paused = !art.playing;
      } catch {
        paused = !art.playing;
      }
      if (paused) void art.play();
      else art.pause();
      notifyPlaying();
      return true;
    }
    case 'prev':
      void import('@/stores/tv-hub/detail').then((m) => m.playPrevEpisode());
      return true;
    case 'next':
      void import('@/stores/tv-hub/detail').then((m) => m.playNextEpisode());
      return true;
    case 'repeat':
      try {
        // Artplayer 运行时有 loop，类型定义未声明
        const player = art as Artplayer & { loop?: boolean };
        player.loop = !player.loop;
      } catch {
        /* */
      }
      return true;
    default:
      return false;
  }
}

/** LOCAL do=danmaku：往当前弹幕插件塞一条（只读模式仍可本地显示） */
export function emitLocalDanmaku(
  text: string,
  opts?: { border?: boolean; color?: string },
): boolean {
  const art = current;
  if (!art || !text.trim()) return false;
  try {
    const plugin = (
      art.plugins as {
        artplayerPluginDanmuku?: { emit?: (o: unknown) => void };
      }
    )?.artplayerPluginDanmuku;
    if (plugin?.emit) {
      const border = opts?.border === true;
      plugin.emit({
        text: text.trim(),
        time: art.currentTime || 0,
        color: opts?.color ?? '#ffffff',
        border,
        mode: 0,
        ...(border
          ? {
              style: {
                borderRadius: '8px',
                padding: '2px 8px',
                boxSizing: 'border-box',
              },
            }
          : {}),
      });
      return true;
    }
  } catch (e) {
    console.warn('[tv-danmaku]', e);
  }
  return false;
}

export function getTvMediaSnapshot(): {
  playing: boolean;
  currentTime: number;
  duration: number;
  url: string;
} | null {
  const art = current;
  if (!art) return null;
  return {
    playing: !!art.playing,
    currentTime: art.currentTime || 0,
    duration: art.duration || 0,
    url: String(art.url ?? ''),
  };
}
