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

/**
 * 重排后按 id 沿用 prev 中的 item 引用，避免仅顺序变化时子树 remount。
 * 仅当 next 中仍是同一对象引用时才沿用；字段更新（如 coverUrl）必须采用 next 中的新对象。
 */
export function stabilizeReorderedListById<T>(
  prev: readonly T[],
  next: readonly T[],
  getId: (item: T) => string,
): readonly T[] {
  if (prev.length === 0) return next;
  const prevById = new Map(prev.map((item) => [getId(item), item]));
  const merged = next.map((item) => {
    const old = prevById.get(getId(item));
    return old && old === item ? old : item;
  });
  if (merged.every((item, i) => item === next[i])) return next;
  return merged;
}
