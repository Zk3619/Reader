/**
 * 指针长按重复步进：首击立即一步，延迟后开始重复，间隔逐渐缩短至下限。
 * 行为对齐原生 number spin（约 400ms 延迟 → ~120ms 起 → 加速到 ~40ms）。
 */

export interface SpinHoldOptions {
  /** 每步回调；返回 false 时停止（如已到边界） */
  onStep: () => boolean | void;
  /** 首击后到自动重复的延迟 */
  delayMs?: number;
  /** 自动重复起始间隔 */
  initialIntervalMs?: number;
  /** 最快间隔 */
  minIntervalMs?: number;
  /** 每拍间隔乘数（小于 1 加速） */
  acceleration?: number;
}

export interface SpinHoldController {
  start: () => void;
  stop: () => void;
  readonly active: boolean;
}

export function createSpinHold(options: SpinHoldOptions): SpinHoldController {
  const delayMs = options.delayMs ?? 400;
  const initialIntervalMs = options.initialIntervalMs ?? 120;
  const minIntervalMs = options.minIntervalMs ?? 40;
  const acceleration = options.acceleration ?? 0.85;

  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  const clearTimers = () => {
    if (delayTimer !== undefined) {
      clearTimeout(delayTimer);
      delayTimer = undefined;
    }
    if (intervalTimer !== undefined) {
      clearTimeout(intervalTimer);
      intervalTimer = undefined;
    }
  };

  const stop = () => {
    active = false;
    clearTimers();
  };

  const start = () => {
    stop();
    active = true;
    if (options.onStep() === false) {
      stop();
      return;
    }

    delayTimer = setTimeout(() => {
      delayTimer = undefined;
      if (!active) return;

      let interval = initialIntervalMs;
      const tick = () => {
        if (!active) return;
        if (options.onStep() === false) {
          stop();
          return;
        }
        interval = Math.max(minIntervalMs, interval * acceleration);
        intervalTimer = setTimeout(tick, interval);
      };
      tick();
    }, delayMs);
  };

  return {
    start,
    stop,
    get active() {
      return active;
    },
  };
}
