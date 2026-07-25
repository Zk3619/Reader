/** 数值输入共用：格式化 / 钳制 / 步进对齐 */

function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  if (s.includes('e') || s.includes('E')) {
    const [base, expRaw] = s.toLowerCase().split('e');
    const exp = Number(expRaw);
    const baseDecimals = base.includes('.') ? (base.split('.')[1]?.length ?? 0) : 0;
    return Math.max(0, baseDecimals - exp);
  }
  return s.includes('.') ? (s.split('.')[1]?.length ?? 0) : 0;
}

export function formatNumberByStep(value: number, step = 1): string {
  if (!Number.isFinite(value)) return '';
  const decimals = stepDecimals(step);
  if (decimals <= 0) return String(Math.round(value));
  return value.toFixed(decimals);
}

export function clampNumber(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

/** 按 step 对齐，避免浮点误差 */
export function snapNumber(value: number, step = 1, min = 0): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const base = Number.isFinite(min) ? min : 0;
  const steps = Math.round((value - base) / step);
  const next = base + steps * step;
  return Number(next.toFixed(stepDecimals(step)));
}
