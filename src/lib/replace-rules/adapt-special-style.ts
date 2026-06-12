/**
 * 特殊 HTML 块保护（对齐 Legado AppPattern.useHtmlRegex + ContentProcessor）
 *
 * 替换净化前将 <usehtml>...</usehtml> 换为占位符，避免规则误伤内部 HTML。
 */

const USE_HTML_REGEX = /<usehtml>[\s\S]*?<\/usehtml>/gi;

export interface UseHtmlShield {
  text: string;
  placeholders: Map<string, string>;
}

export function isAdaptSpecialStyleEnabled(config?: { adaptSpecialStyle?: boolean }): boolean {
  return config?.adaptSpecialStyle !== false;
}

export function shieldUseHtmlBlocks(content: string): UseHtmlShield {
  const placeholders = new Map<string, string>();
  let index = 0;
  const text = content.replace(USE_HTML_REGEX, (match) => {
    const placeholder = `特殊格式的占位不应该被看见${index}。`;
    index += 1;
    placeholders.set(placeholder, `\n${match.replace(/\n/g, '')}\n`);
    return placeholder;
  });
  return { text, placeholders };
}

export function restoreUseHtmlBlocks(text: string, placeholders: Map<string, string>): string {
  let out = text;
  for (const [placeholder, original] of placeholders) {
    out = out.split(placeholder).join(original);
  }
  return out;
}
