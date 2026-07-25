import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSpinHold } from '@/lib/ui/spin-hold';
import {
  clampNumber,
  formatNumberByStep,
  snapNumber,
} from '@/lib/ui/number-input-math';

describe('spin-hold', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediately then repeats with accelerating interval', () => {
    const onStep = vi.fn(() => true);
    const hold = createSpinHold({
      onStep,
      delayMs: 400,
      initialIntervalMs: 100,
      minIntervalMs: 40,
      acceleration: 0.5,
    });

    hold.start();
    expect(onStep).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(399);
    expect(onStep).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    // delay elapsed → first repeat tick
    expect(onStep).toHaveBeenCalledTimes(2);

    // 下一间隔 100ms；触发后加速为 50ms，同一次 advance 内可能再触发一次
    vi.advanceTimersByTime(100);
    expect(onStep.mock.calls.length).toBeGreaterThanOrEqual(3);

    hold.stop();
    const afterStop = onStep.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenCalledTimes(afterStop);
  });

  it('stops when onStep returns false', () => {
    let n = 0;
    const hold = createSpinHold({
      onStep: () => {
        n += 1;
        return n < 2;
      },
      delayMs: 100,
      initialIntervalMs: 50,
    });

    hold.start();
    expect(n).toBe(1);
    vi.advanceTimersByTime(100);
    expect(n).toBe(2);
    vi.advanceTimersByTime(500);
    expect(n).toBe(2);
  });
});

describe('number-input-math', () => {
  it('formats by step decimals', () => {
    expect(formatNumberByStep(1.234, 1)).toBe('1');
    expect(formatNumberByStep(1.234, 0.1)).toBe('1.2');
    expect(formatNumberByStep(1.234, 0.01)).toBe('1.23');
  });

  it('clamps and snaps', () => {
    expect(clampNumber(5, 0, 3)).toBe(3);
    expect(snapNumber(1.24, 0.1, 0)).toBe(1.2);
    expect(snapNumber(1.26, 0.1, 0)).toBe(1.3);
  });
});
