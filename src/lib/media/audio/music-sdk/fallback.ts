/**
 * music-sdk 多接口降级：按序尝试 provider，全部失败再返回 null
 */

export async function firstSuccess<T>(
  providers: Array<() => Promise<T | null | undefined>>,
  validate: (value: T) => boolean = () => true,
): Promise<T | null> {
  for (const run of providers) {
    try {
      const value = await run();
      if (value != null && validate(value)) return value;
    } catch {
      /* 尝试下一个 provider */
    }
  }
  return null;
}

/**
 * 优先取「够满」的结果（如搜索 limit=30），否则退回条数最多的有效结果。
 * 避免第一个接口只回 20 条就被当成成功，导致聚合页少歌。
 */
export async function firstFullest<T>(
  providers: Array<() => Promise<T | null | undefined>>,
  sizeOf: (value: T) => number,
  preferredSize: number,
  validate: (value: T) => boolean = () => true,
): Promise<T | null> {
  let best: T | null = null;
  let bestSize = -1;
  for (const run of providers) {
    try {
      const value = await run();
      if (value == null || !validate(value)) continue;
      const size = sizeOf(value);
      if (size > bestSize) {
        best = value;
        bestSize = size;
      }
      if (preferredSize > 0 && size >= preferredSize) return value;
    } catch {
      /* 尝试下一个 */
    }
  }
  return best;
}

export function hasItems<T>(items: readonly T[] | null | undefined): items is readonly T[] {
  return Array.isArray(items) && items.length > 0;
}

export async function safeCall<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}
