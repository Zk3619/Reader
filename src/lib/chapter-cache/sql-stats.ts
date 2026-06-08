/** SQLite 聚合结果归一化为非负整数（sql.js / Tauri 可能返回 string） */
export function sqlNonNegativeInt(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}
