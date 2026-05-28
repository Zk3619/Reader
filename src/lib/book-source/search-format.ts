/**
 * 搜索结果字段格式化（对齐 Legado BookHelp/StringUtils 语义）
 */

export function normalizeAuthorText(raw: string): string {
  return raw
    .replace(/^\s*作\s*者[:：\s]+/u, '')
    .replace(/\s+著/u, '')
    .trim();
}

export function normalizeBookNameText(raw: string): string {
  return raw
    .replace(/\s+作\s*者.*$/u, '')
    .replace(/\s+\S+\s+著/u, '')
    .trim();
}

/** 纯数字走 Legado wordCountFormat；带「万」等单位的补全「字」后缀（Legado 徽标会漏） */
export function formatWordCountLikeLegado(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  if (/^-?\d+$/.test(text)) {
    const num = Number(text);
    if (!Number.isFinite(num) || num <= 0) return '';
    if (num > 10000) {
      const wan = Math.round((num / 10000) * 10) / 10;
      return `${wan}万字`;
    }
    return `${Math.floor(num)}字`;
  }
  if (/万(?!\s*字)\s*$/u.test(text)) {
    return `${text}字`;
  }
  if (/[wW](?!\s*字)\s*$/u.test(text)) {
    return `${text.replace(/[wW]\s*$/u, '')}万字`;
  }
  if (/千(?!\s*字)\s*$/u.test(text)) {
    return `${text}字`;
  }
  if (/[kK](?!\s*字)\s*$/u.test(text)) {
    return `${text.replace(/[kK]\s*$/u, '')}千字`;
  }
  return text;
}

export function buildPreciseSearchFilter(
  name: string,
  author: string,
): (name: string, author: string, kind?: string) => boolean {
  const normalizedName = normalizeBookNameText(name);
  const normalizedAuthor = normalizeAuthorText(author);
  const targetName = normalizedName || name;
  const targetAuthor = normalizedAuthor || author;
  return (resultName: string, resultAuthor: string) =>
    normalizeBookNameText(resultName) === targetName &&
    normalizeAuthorText(resultAuthor) === targetAuthor;
}

export function shouldFallbackToDetailParsing(bookUrlPattern: string | undefined): boolean {
  return !bookUrlPattern?.trim();
}
