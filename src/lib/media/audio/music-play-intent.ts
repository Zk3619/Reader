/**
 * 下一次 loadSegment 强制自动播放（曲终切歌 / 用户点播放取链）。
 * 优先于 startupAutoPlay 门闩与「选中后播放」开关的瞬时误判。
 */
let forceNextLoadAutoPlay = false;

export function requestMusicAutoPlayOnce(): void {
  forceNextLoadAutoPlay = true;
}

export function consumeMusicForceAutoPlay(): boolean {
  if (!forceNextLoadAutoPlay) return false;
  forceNextLoadAutoPlay = false;
  return true;
}

/** 测试用 */
export function resetMusicPlayIntentForTests(): void {
  forceNextLoadAutoPlay = false;
}
