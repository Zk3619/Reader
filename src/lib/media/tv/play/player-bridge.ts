/**
 * 当前影视 Artplayer 实例桥（LOCAL control /media / danmaku）
 */

import type Artplayer from 'artplayer';

let current: Artplayer | null = null;

export function registerTvPlayer(art: Artplayer | null): void {
  current = art;
}

export function getTvPlayer(): Artplayer | null {
  return current;
}

export function controlTvPlayer(type: string): boolean {
  const art = current;
  if (!art) return false;
  switch (type) {
    case 'play':
      void art.play();
      return true;
    case 'pause':
      art.pause();
      return true;
    case 'stop':
      art.pause();
      art.currentTime = 0;
      return true;
    case 'replay':
      art.currentTime = 0;
      void art.play();
      return true;
    case 'toggle':
      if (art.playing) art.pause();
      else void art.play();
      return true;
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
export function emitLocalDanmaku(text: string): boolean {
  const art = current;
  if (!art || !text.trim()) return false;
  try {
    const plugin = (
      art.plugins as {
        artplayerPluginDanmuku?: { emit?: (o: unknown) => void };
      }
    )?.artplayerPluginDanmuku;
    if (plugin?.emit) {
      plugin.emit({
        text: text.trim(),
        time: art.currentTime || 0,
        color: '#ffffff',
        border: false,
        mode: 0,
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
