/**
 * 章节 variable 字段（JSON）读写，对齐 Legado BookChapter.putVariable
 */

export function parseChapterVariableMap(variable?: string | null): Record<string, string> {
  if (!variable?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(variable);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
        else if (v != null) out[k] = String(v);
      }
      return out;
    }
  } catch {
    /* 非 JSON 时忽略 */
  }
  return {};
}

export function getChapterVariable(variable: string | undefined, key: string): string | null {
  const value = parseChapterVariableMap(variable)[key];
  return value?.trim() ? value : null;
}
