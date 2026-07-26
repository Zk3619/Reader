/**
 * MediaClock：音频主时钟锚点
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

export class MediaClock {
  private mediaAnchor = 0;
  private ctxAnchor = 0;
  private rate = 1;
  private paused = true;
  private pausedMediaTime = 0;

  constructor(private readonly getCtxTime: () => number) {}

  getRate(): number {
    return this.rate;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** play / resume / seek / rate 变更后必调 */
  anchor(mediaTime: number, ctxTime?: number): void {
    this.mediaAnchor = mediaTime;
    this.ctxAnchor = ctxTime ?? this.getCtxTime();
    this.pausedMediaTime = mediaTime;
    this.paused = false;
  }

  pause(): void {
    if (this.paused) return;
    this.pausedMediaTime = this.mediaTimeNow();
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.anchor(this.pausedMediaTime);
  }

  setRate(rate: number): void {
    const t = this.mediaTimeNow();
    this.rate = rate > 0 && Number.isFinite(rate) ? rate : 1;
    if (!this.paused) this.anchor(t);
    else this.pausedMediaTime = t;
  }

  mediaTimeNow(): number {
    if (this.paused) return this.pausedMediaTime;
    const ctxNow = this.getCtxTime();
    return this.mediaAnchor + (ctxNow - this.ctxAnchor) * this.rate;
  }
}

/** 管线世代：seek/flush 自增；ORT 回调落队前校验 */
export class PipelineEpoch {
  private value = 0;

  get current(): number {
    return this.value;
  }

  bump(): number {
    this.value += 1;
    return this.value;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.value;
  }
}
