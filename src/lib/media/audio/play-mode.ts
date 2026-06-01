/**
 * 音频章节切换（对齐 Legado AudioPlay.next / prev）
 */

import { AudioPlayMode } from '@/lib/media/audio/types';

export function resolveNextChapterIndex(
  currentIndex: number,
  catalogLength: number,
  playMode: AudioPlayMode,
): number | null {
  if (catalogLength <= 0) return null;

  switch (playMode) {
    case AudioPlayMode.listEndStop:
      return currentIndex + 1 < catalogLength ? currentIndex + 1 : null;
    case AudioPlayMode.singleLoop:
      return currentIndex;
    case AudioPlayMode.random:
      if (catalogLength === 1) return 0;
      let next = currentIndex;
      for (let i = 0; i < 8 && next === currentIndex; i++) {
        next = Math.floor(Math.random() * catalogLength);
      }
      return next === currentIndex ? (currentIndex + 1) % catalogLength : next;
    case AudioPlayMode.listLoop:
      return (currentIndex + 1) % catalogLength;
    default:
      return currentIndex + 1 < catalogLength ? currentIndex + 1 : null;
  }
}

export function resolvePrevChapterIndex(currentIndex: number): number | null {
  return currentIndex > 0 ? currentIndex - 1 : null;
}

/** 跳过卷名章节，返回可播放的章节索引 */
export function findPlayableChapterIndex(
  catalog: { isVolume: boolean }[],
  startIndex: number,
  direction: 1 | -1,
): number | null {
  if (catalog.length === 0) return null;
  let i = startIndex;
  while (i >= 0 && i < catalog.length) {
    if (!catalog[i]?.isVolume) return i;
    i += direction;
  }
  return null;
}
