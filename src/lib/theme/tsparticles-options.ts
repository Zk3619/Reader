/**
 * tsParticles optionsJson 可视化编辑 — 常用字段读写
 */

export interface TsParticlesVisualOptions {
  particleCount: number;
  speed: number;
  opacity: number;
  sizeMax: number;
  linkDistance: number;
  fpsLimit: number;
}

export const DEFAULT_VISUAL_PARTICLE_OPTIONS: TsParticlesVisualOptions = {
  particleCount: 60,
  speed: 1.2,
  opacity: 0.45,
  sizeMax: 3,
  linkDistance: 120,
  fpsLimit: 60,
};

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (isRecord(value) && typeof value.min === 'number' && typeof value.max === 'number') {
    return value.max;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function parseTsParticlesVisualOptions(optionsJson?: string): TsParticlesVisualOptions {
  const base = { ...DEFAULT_VISUAL_PARTICLE_OPTIONS };
  if (!optionsJson?.trim()) return base;
  try {
    const raw = JSON.parse(optionsJson) as Record<string, unknown>;
    const particles = isRecord(raw.particles) ? raw.particles : {};
    const number = isRecord(particles.number) ? particles.number : {};
    const move = isRecord(particles.move) ? particles.move : {};
    const opacity = particles.opacity;
    const size = particles.size;
    const links = isRecord(particles.links) ? particles.links : {};
    return {
      particleCount: readNumber(number.value, base.particleCount),
      speed: readNumber(move.speed, base.speed),
      opacity: readNumber(opacity, base.opacity),
      sizeMax: readNumber(size, base.sizeMax),
      linkDistance: readNumber(links.distance, base.linkDistance),
      fpsLimit: readNumber(raw.fpsLimit, base.fpsLimit),
    };
  } catch {
    return base;
  }
}

export function mergeTsParticlesVisualOptions(
  optionsJson: string | undefined,
  patch: Partial<TsParticlesVisualOptions>,
): string {
  let raw: Record<string, unknown> = {};
  if (optionsJson?.trim()) {
    try {
      raw = JSON.parse(optionsJson) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }

  const particles = isRecord(raw.particles) ? { ...raw.particles } : {};
  const number = isRecord(particles.number) ? { ...particles.number } : {};
  const move = isRecord(particles.move) ? { ...particles.move } : {};
  const links = isRecord(particles.links) ? { ...particles.links } : {};

  if (patch.particleCount != null) number.value = patch.particleCount;
  if (patch.speed != null) move.speed = patch.speed;
  if (patch.opacity != null) particles.opacity = patch.opacity;
  if (patch.sizeMax != null) particles.size = { min: 1, max: patch.sizeMax };
  if (patch.linkDistance != null) links.distance = patch.linkDistance;
  if (patch.fpsLimit != null) raw.fpsLimit = patch.fpsLimit;

  particles.number = number;
  particles.move = move;
  particles.links = links;
  raw.particles = particles;

  return JSON.stringify(raw, null, 2);
}
