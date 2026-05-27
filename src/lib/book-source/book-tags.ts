/** 将书源 kind / category / tags 等标签串拆成独立项 */

/** 常见分隔符：逗号、分号、竖线、斜杠、顿号、点、空格等 */
const TAG_SPLIT_RE = /[,，;；|｜/、·•．.\s]+/;

export function splitBookTagValues(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(TAG_SPLIT_RE)) {
    const t = part.trim();
    if (!t || seen.has(t)) continue;
    if (!/[\u4e00-\u9fa5A-Za-z0-9]/.test(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** 合并 kind/category/tags 后拆分，并与已有徽标文案去重 */
export function collectBookBadgeEntries(book: {
  source?: string;
  status?: string;
  tab?: string;
  score?: string;
  kind?: string;
  category?: string;
  tags?: string;
}): { key: string; value: string }[] {
  const entries: { key: string; value: string }[] = [];
  const seen = new Set<string>();

  const push = (key: string, value: string) => {
    const t = value.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    entries.push({ key, value: t });
  };

  if (book.source) push('source', book.source);
  if (book.status) push('status', book.status);
  if (book.tab) push('tab', book.tab);
  if (book.score) push('score', book.score);

  const tagBlob = [book.kind, book.category, book.tags]
    .filter((s) => s?.trim())
    .join(',');
  for (const v of splitBookTagValues(tagBlob)) {
    const normalized = v.replace(/^#+/, '').trim();
    if (!normalized) continue;
    push('tag', normalized);
  }

  return entries;
}
