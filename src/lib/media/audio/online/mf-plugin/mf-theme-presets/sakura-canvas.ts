/**
 * 轻量 2D 樱花飘落（对齐 MusicFree sakura iframe 氛围，非 WebGL 完整移植）
 */

type Petal = {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  rot: number;
  rotSpeed: number;
  opacity: number;
};

const PETAL_COUNT = 48;

function randomPetal(width: number, height: number, fromTop = false): Petal {
  return {
    x: Math.random() * width,
    y: fromTop ? -20 - Math.random() * height * 0.3 : Math.random() * height,
    size: 6 + Math.random() * 10,
    speed: 0.4 + Math.random() * 1.2,
    drift: (Math.random() - 0.5) * 0.6,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.04,
    opacity: 0.35 + Math.random() * 0.45,
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, p: Petal): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = p.opacity;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
  g.addColorStop(0, '#ffd6e8');
  g.addColorStop(0.55, '#ff9eb8');
  g.addColorStop(1, 'rgba(255, 118, 118, 0.15)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.size * 0.55, p.size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function mountSakuraPetalsLayer(host: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.92;';
  host.prepend(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  let width = 0;
  let height = 0;
  let petals: Petal[] = [];
  let raf = 0;
  let running = true;

  const resize = () => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    petals = Array.from({ length: PETAL_COUNT }, () => randomPetal(width, height));
  };

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  resize();

  const tick = () => {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i]!;
      p.y += p.speed;
      p.x += p.drift + Math.sin(p.y * 0.01 + i) * 0.15;
      p.rot += p.rotSpeed;
      if (p.y > height + 24) petals[i] = randomPetal(width, height, true);
      drawPetal(ctx, p);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  };
}
