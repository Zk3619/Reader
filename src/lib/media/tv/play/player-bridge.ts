/**
 * 当前影视 Artplayer 实例桥（LOCAL control /media）
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
    default:
      return false;
  }
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
