/** 虚拟网格行高取整，避免 ceil 在 gap=0 时多出 1px 空隙 */
export function roundVirtualGridPx(value: number): number {
  return Math.max(0, Math.round(value));
}
