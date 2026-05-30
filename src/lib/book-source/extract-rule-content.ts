/**
 * 从 ruleContent JS 返回值或 $.content 结果中提取正文
 */

export function extractContentFromRuleOutput(raw: string): string {
  const text = raw?.trim() ?? '';
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return text;

    if (typeof parsed.content === 'string' && parsed.content.trim()) {
      return parsed.content;
    }
    if (typeof parsed.msg === 'string' && parsed.msg.trim()) {
      return parsed.msg;
    }
    const data = parsed.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nested = data as Record<string, unknown>;
      if (typeof nested.content === 'string' && nested.content.trim()) {
        return nested.content;
      }
    }
    if (typeof data === 'string' && data.trim()) {
      return data;
    }
  } catch {
    return text;
  }

  return text;
}
