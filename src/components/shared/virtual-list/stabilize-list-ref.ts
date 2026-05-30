/** 成员与引用均未变时沿用上一数组，减少虚拟列表无效 reconcile */
export function stabilizeListByRef<T>(prev: readonly T[], next: readonly T[]): readonly T[] {
  if (prev.length === next.length && prev.every((item, i) => item === next[i])) {
    return prev;
  }
  return next;
}

/** primitive 列表内容未变时沿用上一引用，避免 For 无效 reconcile */
export function stabilizePrimitiveList<T extends string | number>(
  prev: readonly T[],
  next: readonly T[],
): readonly T[] {
  if (prev.length === next.length && prev.every((v, i) => v === next[i])) {
    return prev;
  }
  return next;
}

/** 重排后按 id 沿用 prev 中的 item 引用，避免仅顺序变化时子树 remount */
export function stabilizeReorderedListById<T>(
  prev: readonly T[],
  next: readonly T[],
  getId: (item: T) => string,
): readonly T[] {
  if (prev.length === 0) return next;
  const prevById = new Map(prev.map((item) => [getId(item), item]));
  const merged = next.map((item) => prevById.get(getId(item)) ?? item);
  if (merged.every((item, i) => item === next[i])) return next;
  return merged;
}
