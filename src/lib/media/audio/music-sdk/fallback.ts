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
