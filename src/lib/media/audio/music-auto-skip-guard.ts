/**
 * 错误自动切歌节流：防止取链失败 / 伪 media error 在队列里零延迟连环跳过。
 */

export const MUSIC_AUTO_SKIP_MIN_INTERVAL_MS = 2500;
export const MUSIC_AUTO_SKIP_BURST_LIMIT = 2;
export const MUSIC_AUTO_SKIP_BURST_WINDOW_MS = 20_000;
export const MUSIC_AUTO_SKIP_DELAY_MS = 800;

let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let lastSkipAt = 0;
let burstCount = 0;
let burstWindowStart = 0;

export function cancelScheduledMusicAutoSkip(): void {
  if (!pendingTimer) return;
  clearTimeout(pendingTimer);
  pendingTimer = undefined;
}

/** 成功起播后重置连跳计数 */
export function noteMusicPlaybackHealthy(): void {
  burstCount = 0;
  cancelScheduledMusicAutoSkip();
}

/**
 * 尝试占用一次自动跳过名额。
 * @returns false 表示处于冷却或 burst 上限，调用方不得切歌
 */
export function consumeMusicAutoSkipSlot(now = Date.now()): boolean {
  if (lastSkipAt > 0 && now - lastSkipAt < MUSIC_AUTO_SKIP_MIN_INTERVAL_MS) return false;
  if (burstWindowStart > 0 && now - burstWindowStart > MUSIC_AUTO_SKIP_BURST_WINDOW_MS) {
    burstWindowStart = now;
    burstCount = 0;
  }
  if (burstWindowStart <= 0) burstWindowStart = now;
  if (burstCount >= MUSIC_AUTO_SKIP_BURST_LIMIT) return false;
  lastSkipAt = now;
  burstCount += 1;
  return true;
}

/** 延迟执行自动切歌；新的 schedule 会取消未触发的旧任务 */
export function scheduleMusicAutoSkip(
  run: () => void,
  delayMs = MUSIC_AUTO_SKIP_DELAY_MS,
): void {
  cancelScheduledMusicAutoSkip();
  pendingTimer = setTimeout(() => {
    pendingTimer = undefined;
    if (!consumeMusicAutoSkipSlot()) return;
    run();
  }, Math.max(0, delayMs));
}

/** 测试用重置 */
export function resetMusicAutoSkipGuardForTests(): void {
  cancelScheduledMusicAutoSkip();
  lastSkipAt = 0;
  burstCount = 0;
  burstWindowStart = 0;
}
