/**
 * 判断 audio error/ended 是否属于切歌取链中的瞬时噪声。
 * 清空 src / load()、取链中触发的事件不得驱动 autoSkip / 切歌。
 *
 * 注意：浏览器在曲终派发的 `ended` 本身可信，不应因 duration 瞬时 NaN/0 而吞掉，
 * 否则列表循环会表现为「播完即停、不切歌」。
 */
export function shouldIgnoreTransientAudioFailure(options: {
  loading: boolean;
  intentionalReset: boolean;
  hasPlayableUrl: boolean;
  duration?: number;
  msSinceSrcApplied?: number;
  event: 'error' | 'ended';
}): boolean {
  if (options.loading || options.intentionalReset) return true;
  if (!options.hasPlayableUrl) return true;

  const age = Math.max(0, options.msSinceSrcApplied ?? 0);

  if (options.event === 'ended') {
    // 新 src 后极短时间内的 ended 视为噪声；真正曲终不依赖 duration
    if (age < 400) return true;
    return false;
  }

  const dur = options.duration;
  const hasDuration = dur != null && Number.isFinite(dur) && dur > 0;
  if (age < 2000) return true;
  if (!hasDuration && age < 10_000) return true;
  return false;
}
