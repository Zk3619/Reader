import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import type { SearchBook } from '@/types';

export type SharedBadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning';

export interface SharedBadgeEntry {
  value: string;
  variant: SharedBadgeVariant;
}

export const BOOK_BADGE_TOOLTIP_CONTENT_CLASS =
  'max-w-md max-h-40 overflow-y-auto whitespace-normal break-all text-xs leading-relaxed';

const EXPLORE_BADGE_KEYS = ['source', 'status', 'tab', 'category', 'tags', 'score'] as const;

function toCleanText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function pushUniqueBadge(
  entries: SharedBadgeEntry[],
  seen: Set<string>,
  value: string,
  variant: SharedBadgeVariant,
) {
  const text = toCleanText(value);
  if (!text || seen.has(text)) return;
  seen.add(text);
  entries.push({ value: text, variant });
}

function getStatusBadgeVariant(status: string): SharedBadgeVariant {
  const s = status.trim();
  if (/已完结|完结|完成/i.test(s)) return 'success';
  if (/连载|更新中/i.test(s)) return 'warning';
  if (/已出版|出版/i.test(s)) return 'secondary';
  return 'default';
}

function parseKindBadges(rawKind: string | undefined): string[] {
  const raw = rawKind?.trim() || '';
  if (!raw) return [];
  const tokens = raw
    .split(/[\n,，|｜]+/g)
    .map((s) => s.trim())
    .flatMap((s) => {
      if (s.includes('#')) {
        const matches = s.match(/#[^#\s,，|｜]+/g);
        return matches ?? [s];
      }
      return [s];
    })
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens)).slice(0, 4);
}

export function buildExploreBadgeEntries(book: SearchBook): SharedBadgeEntry[] {
  const entries: SharedBadgeEntry[] = [];
  const seen = new Set<string>();
  for (const key of EXPLORE_BADGE_KEYS) {
    const value = toCleanText(book[key]);
    const variant: SharedBadgeVariant =
      key === 'status' ? getStatusBadgeVariant(value) : 'secondary';
    pushUniqueBadge(entries, seen, value, variant);
  }
  return entries;
}

export function buildSearchResultBadgeEntries(
  book: MergedSearchBook,
  onShelf: boolean,
): SharedBadgeEntry[] {
  const entries: SharedBadgeEntry[] = [];
  const seen = new Set<string>();
  const wordCount = toCleanText(book.wordCount || book.chapterWordCountText);
  if (wordCount) {
    pushUniqueBadge(entries, seen, wordCount, 'secondary');
  }
  for (const value of parseKindBadges(book.kind)) {
    pushUniqueBadge(entries, seen, value, 'secondary');
  }
  const origins =
    book.mergedOriginNames.length > 0
      ? book.mergedOriginNames
      : book.originName
        ? [book.originName]
        : [];
  for (const value of origins) {
    pushUniqueBadge(entries, seen, value, 'outline');
  }
  if (onShelf) pushUniqueBadge(entries, seen, '已在书架', 'secondary');
  return entries;
}

export function buildBadgeTooltipText(entries: SharedBadgeEntry[]): string {
  return entries.map((entry) => entry.value).join('，');
}

