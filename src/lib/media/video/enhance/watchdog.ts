/**
 * 性能看门狗：连续呈现延迟 → 降 Anime4K Mode → 关 RIFE
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import type { Anime4KMode } from '@/lib/media/video/playback/types';

const MODE_LADDER: Anime4KMode[] = ['AA', 'BB', 'CA', 'A', 'B', 'C', 'off'];

export type EnhanceWatchdogHooks = {
  onDowngradeMode?: (mode: Anime4KMode) => void;
  onDisableRife?: () => void;
  onToast?: (msg: string) => void;
};

export type FrameBudgetSample = {
  decodeMs?: number;
  srMs?: number;
  rifeMs?: number;
  presentMs?: number;
  /** 本帧总耗时；也可用 sum */
  totalMs?: number;
};

export class EnhanceWatchdog {
  private streak = 0;
  private mode: Anime4KMode;
  private rifeEnabled: boolean;
  private readonly budgetMs: number;
  private readonly streakLimit: number;

  constructor(
    initial: { mode: Anime4KMode; rifeEnabled: boolean },
    private hooks: EnhanceWatchdogHooks = {},
    opts?: { budgetMs?: number; streakLimit?: number },
  ) {
    this.mode = initial.mode;
    this.rifeEnabled = initial.rifeEnabled;
    this.budgetMs = opts?.budgetMs ?? 20;
    this.streakLimit = opts?.streakLimit ?? 30;
  }

  getMode(): Anime4KMode {
    return this.mode;
  }

  isRifeEnabled(): boolean {
    return this.rifeEnabled;
  }

  reset(mode: Anime4KMode, rifeEnabled: boolean): void {
    this.mode = mode;
    this.rifeEnabled = rifeEnabled;
    this.streak = 0;
  }

  sample(s: FrameBudgetSample): void {
    const total =
      s.totalMs ??
      (s.decodeMs ?? 0) + (s.srMs ?? 0) + (s.rifeMs ?? 0) + (s.presentMs ?? 0);
    if (total > this.budgetMs) this.streak += 1;
    else this.streak = Math.max(0, this.streak - 1);

    if (this.streak < this.streakLimit) return;
    this.streak = 0;

    if (this.mode !== 'off') {
      const idx = MODE_LADDER.indexOf(this.mode);
      const next =
        idx >= 0 && idx < MODE_LADDER.length - 1
          ? MODE_LADDER[idx + 1]!
          : 'off';
      // 若当前不在 ladder（如仅 A），降到 C 再 off
      const downgraded =
        this.mode === 'A' || this.mode === 'B' || this.mode === 'C'
          ? this.mode === 'C'
            ? 'off'
            : this.mode === 'B'
              ? 'C'
              : 'B'
          : next;
      this.mode = downgraded;
      this.hooks.onDowngradeMode?.(this.mode);
      this.hooks.onToast?.(
        this.mode === 'off'
          ? '性能不足：已关闭 Anime4K'
          : `性能不足：Anime4K 降至 Mode ${this.mode}`,
      );
      return;
    }

    if (this.rifeEnabled) {
      this.rifeEnabled = false;
      this.hooks.onDisableRife?.();
      this.hooks.onToast?.('性能不足：已关闭实时补帧');
    }
  }
}

/** 帧预算表（供 benchmark 页） */
export type FrameBudgetReport = {
  samples: number;
  avgDecodeMs: number;
  avgSrMs: number;
  avgRifeMs: number;
  avgPresentMs: number;
  avgTotalMs: number;
  maxTotalMs: number;
};

export class FrameBudgetAccumulator {
  private n = 0;
  private sumDecode = 0;
  private sumSr = 0;
  private sumRife = 0;
  private sumPresent = 0;
  private sumTotal = 0;
  private maxTotal = 0;

  push(s: FrameBudgetSample): void {
    const d = s.decodeMs ?? 0;
    const sr = s.srMs ?? 0;
    const r = s.rifeMs ?? 0;
    const p = s.presentMs ?? 0;
    const t = s.totalMs ?? d + sr + r + p;
    this.n += 1;
    this.sumDecode += d;
    this.sumSr += sr;
    this.sumRife += r;
    this.sumPresent += p;
    this.sumTotal += t;
    this.maxTotal = Math.max(this.maxTotal, t);
  }

  report(): FrameBudgetReport {
    const n = Math.max(1, this.n);
    return {
      samples: this.n,
      avgDecodeMs: this.sumDecode / n,
      avgSrMs: this.sumSr / n,
      avgRifeMs: this.sumRife / n,
      avgPresentMs: this.sumPresent / n,
      avgTotalMs: this.sumTotal / n,
      maxTotalMs: this.maxTotal,
    };
  }

  reset(): void {
    this.n = 0;
    this.sumDecode = this.sumSr = this.sumRife = this.sumPresent = this.sumTotal = 0;
    this.maxTotal = 0;
  }
}
