/**
 * 元素破碎消失动画（对齐 Legado ExplosionField / ExplosionView）
 */

const SHAKE_MS = 150;
const PARTICLE_DURATION_MS = 650;
const PARTICLE_GRID = 12;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  born: number;
  maxLife: number;
}

function sampleColors(el: HTMLElement): string[] {
  const style = getComputedStyle(el);
  const candidates = [style.backgroundColor, style.color, style.borderColor];
  const out: string[] = [];
  for (const c of candidates) {
    if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') continue;
    if (!out.includes(c)) out.push(c);
  }
  return out.length > 0 ? out : ['hsl(var(--muted-foreground))', 'hsl(var(--primary))'];
}

function runShake(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      if (t >= SHAKE_MS) {
        el.style.transform = '';
        el.style.opacity = '0';
        resolve();
        return;
      }
      const progress = t / SHAKE_MS;
      el.style.transform = `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 6}px) scale(${1 - progress * 0.15})`;
      el.style.opacity = String(Math.max(0, 1 - progress * 0.35));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function runParticleBurst(rect: DOMRect, colors: string[]): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'pointer-events-none fixed inset-0 z-[200]';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      resolve();
      return;
    }

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const particles: Particle[] = [];
    const total = PARTICLE_GRID * PARTICLE_GRID;
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5.5;
      particles.push({
        x: cx + (Math.random() - 0.5) * rect.width,
        y: cy + (Math.random() - 0.5) * rect.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        color: colors[i % colors.length]!,
        size: 2 + Math.random() * 2.5,
        born: performance.now(),
        maxLife: PARTICLE_DURATION_MS * (0.65 + Math.random() * 0.5),
      });
    }

    const frame = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of particles) {
        const age = now - p.born;
        if (age > p.maxLife) continue;
        alive++;
        p.vy += 0.12;
        p.x += p.vx;
        p.y += p.vy;
        const alpha = 1 - age / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (alive > 0) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

export interface ExplodeElementOptions {
  reduceMotion?: boolean;
}

/** 播放破碎动画，结束后 resolve（不修改 DOM 树，由调用方移除节点） */
export async function explodeElement(
  el: HTMLElement,
  options?: ExplodeElementOptions,
): Promise<void> {
  if (options?.reduceMotion) {
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    return;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    el.style.visibility = 'hidden';
    return;
  }

  const colors = sampleColors(el);
  await runShake(el);
  el.style.visibility = 'hidden';
  await runParticleBurst(rect, colors);
}
