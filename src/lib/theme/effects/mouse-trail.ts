/**
 * 鼠标拖尾特效 — Canvas 2D overlay
 */

export interface MouseTrailOptions {
  color?: string;
  length?: number;
  size?: number;
  fadeMs?: number;
  blendMode?: GlobalCompositeOperation;
}

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

export class MouseTrailEffectEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: TrailPoint[] = [];
  private rafId: number | null = null;
  private running = false;
  private opts: Required<MouseTrailOptions>;
  private boundMove: (e: PointerEvent) => void;
  private boundLeave: () => void;

  constructor(
    private container: HTMLElement,
    options: MouseTrailOptions = {},
  ) {
    this.opts = {
      color: options.color ?? 'rgba(8, 145, 178, 0.55)',
      length: options.length ?? 24,
      size: options.size ?? 6,
      fadeMs: options.fadeMs ?? 420,
      blendMode: options.blendMode ?? 'lighter',
    };
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'theme-effect-mouse-trail pointer-events-none absolute inset-0 z-[1]';
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;

    this.boundMove = (e) => this.onMove(e);
    this.boundLeave = () => {
      this.points = [];
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    this.container.appendChild(this.canvas);
    this.resize();
    this.container.addEventListener('pointermove', this.boundMove);
    this.container.addEventListener('pointerleave', this.boundLeave);
    window.addEventListener('resize', this.resize);
    this.loop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.container.removeEventListener('pointermove', this.boundMove);
    this.container.removeEventListener('pointerleave', this.boundLeave);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    this.points = [];
  }

  updateOptions(options: Partial<MouseTrailOptions>): void {
    this.opts = { ...this.opts, ...options };
  }

  private resize = (): void => {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private onMove(e: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    this.points.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
    });
    if (this.points.length > this.opts.length * 2) {
      this.points.splice(0, this.points.length - this.opts.length * 2);
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    this.points = this.points.filter((p) => now - p.t < this.opts.fadeMs);
    const { width, height } = this.container.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.globalCompositeOperation = this.opts.blendMode;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      const age = now - b.t;
      const alpha = Math.max(0, 1 - age / this.opts.fadeMs);
      this.ctx.strokeStyle = this.opts.color.replace(/[\d.]+\)$/, `${alpha})`);
      this.ctx.lineWidth = this.opts.size * alpha;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
