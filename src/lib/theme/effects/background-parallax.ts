/**
 * 背景视差 — 指针位置驱动 background layer transform
 */

export interface BackgroundParallaxOptions {
  maxShiftPx?: number;
}

export class BackgroundParallaxEffectEngine {
  private layer: HTMLDivElement | null = null;
  private running = false;
  private pointer = { x: 0.5, y: 0.5 };
  private opts: Required<BackgroundParallaxOptions>;
  private boundMove: (e: PointerEvent) => void;

  constructor(
    private container: HTMLElement,
    options: BackgroundParallaxOptions = {},
  ) {
    this.opts = { maxShiftPx: options.maxShiftPx ?? 12 };
    this.boundMove = (e) => this.onMove(e);
  }

  /** 绑定到已有背景层；若未传则创建占位层 */
  start(targetLayer?: HTMLElement): void {
    if (this.running) return;
    this.running = true;
    this.layer = (targetLayer as HTMLDivElement | undefined) ?? this.createLayer();
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    if (!targetLayer) {
      this.container.prepend(this.layer);
    }
    this.container.addEventListener('pointermove', this.boundMove);
    this.applyTransform();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.container.removeEventListener('pointermove', this.boundMove);
    if (this.layer?.classList.contains('theme-effect-parallax-layer')) {
      this.layer.remove();
    } else if (this.layer) {
      this.layer.style.transform = '';
    }
    this.layer = null;
  }

  updateOptions(options: Partial<BackgroundParallaxOptions>): void {
    this.opts = { ...this.opts, ...options };
    this.applyTransform();
  }

  private createLayer(): HTMLDivElement {
    const el = document.createElement('div');
    el.className =
      'theme-effect-parallax-layer pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-primary/5 to-accent/10';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  private onMove(e: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer = {
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    };
    this.applyTransform();
  }

  private applyTransform(): void {
    if (!this.layer) return;
    const { maxShiftPx } = this.opts;
    const tx = this.pointer.x * maxShiftPx * 2;
    const ty = this.pointer.y * maxShiftPx * 2;
    this.layer.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.05)`;
    this.layer.style.transition = 'transform 80ms ease-out';
  }
}
