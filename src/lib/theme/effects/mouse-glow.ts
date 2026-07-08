/**
 * 光标光晕 — CSS custom properties + rAF
 */

export interface MouseGlowOptions {
  radius?: number;
  color?: string;
  intensity?: number;
}

export class MouseGlowEffectEngine {
  private overlay: HTMLDivElement;
  private rafId: number | null = null;
  private running = false;
  private pointer = { x: 0.5, y: 0.5 };
  private opts: Required<MouseGlowOptions>;
  private boundMove: (e: PointerEvent) => void;

  constructor(
    private container: HTMLElement,
    options: MouseGlowOptions = {},
  ) {
    this.opts = {
      radius: options.radius ?? 280,
      color: options.color ?? '8, 145, 178',
      intensity: options.intensity ?? 0.35,
    };
    this.overlay = document.createElement('div');
    this.overlay.className =
      'theme-effect-mouse-glow pointer-events-none absolute inset-0 z-[1] overflow-hidden';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.boundMove = (e) => this.onMove(e);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    this.container.appendChild(this.overlay);
    this.container.addEventListener('pointermove', this.boundMove);
    this.render();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.container.removeEventListener('pointermove', this.boundMove);
    this.overlay.remove();
  }

  updateOptions(options: Partial<MouseGlowOptions>): void {
    this.opts = { ...this.opts, ...options };
    this.render();
  }

  private onMove(e: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointer = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    if (this.rafId == null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.render();
      });
    }
  }

  private render(): void {
    const { radius, color, intensity } = this.opts;
    const x = `${this.pointer.x * 100}%`;
    const y = `${this.pointer.y * 100}%`;
    this.overlay.style.background = `radial-gradient(${radius}px circle at ${x} ${y}, rgba(${color}, ${intensity}) 0%, transparent 70%)`;
  }
}
