/**
 * Legado 书籍 readConfig.pageAnim（Int）与 Reader TextViewerPageAnim 互转
 * @see legados-main/app/src/main/java/io/legado/app/constant/PageAnim.kt
 * @see legados-main/app/src/main/java/io/legado/app/ui/book/read/BaseReadBookActivity.showPageAnimConfig
 */

import type { Book } from '@/types';
import type { TextViewerPageAnim } from '@/lib/media/text/reader-ui-config';
import {
  normalizeTextViewerPageAnim,
  TEXT_VIEWER_PAGE_ANIM_LABELS,
} from '@/lib/media/text/text-viewer-page-anim';

/** Legado：-1 或未设置表示跟随全局；0 覆盖 … 4 无动画 */
export type LegadoPageAnimInt = -1 | 0 | 1 | 2 | 3 | 4;

export const LEGADO_PAGE_ANIM_DEFAULT = -1 as LegadoPageAnimInt;

const LEGADO_TO_READER: Record<number, TextViewerPageAnim> = {
  0: 'cover',
  1: 'slide',
  2: 'simulation',
  3: 'scroll',
  4: 'none',
};

const READER_TO_LEGADO: Record<TextViewerPageAnim, Exclude<LegadoPageAnimInt, -1>> = {
  cover: 0,
  slide: 1,
  simulation: 2,
  scroll: 3,
  none: 4,
};

export const BOOK_PAGE_ANIM_PICKER_OPTIONS = [
  'default',
  ...(['cover', 'slide', 'simulation', 'scroll', 'none'] as const),
] as const;

export type BookPageAnimPickerValue = (typeof BOOK_PAGE_ANIM_PICKER_OPTIONS)[number];

export const BOOK_PAGE_ANIM_PICKER_LABELS: Record<BookPageAnimPickerValue, string> = {
  default: '默认（跟随界面设置）',
  cover: TEXT_VIEWER_PAGE_ANIM_LABELS.cover,
  slide: TEXT_VIEWER_PAGE_ANIM_LABELS.slide,
  simulation: TEXT_VIEWER_PAGE_ANIM_LABELS.simulation,
  scroll: TEXT_VIEWER_PAGE_ANIM_LABELS.scroll,
  none: TEXT_VIEWER_PAGE_ANIM_LABELS.none,
};

export function legadoPageAnimToTextViewer(
  value: number | null | undefined,
): TextViewerPageAnim | null {
  if (value == null || value < 0) return null;
  return LEGADO_TO_READER[value] ?? null;
}

export function textViewerPageAnimToLegado(
  anim: TextViewerPageAnim,
): Exclude<LegadoPageAnimInt, -1> {
  return READER_TO_LEGADO[anim];
}

export function bookPageAnimPickerToLegado(value: BookPageAnimPickerValue): LegadoPageAnimInt {
  if (value === 'default') return LEGADO_PAGE_ANIM_DEFAULT;
  return textViewerPageAnimToLegado(value);
}

export function legadoPageAnimToPickerValue(
  value: number | null | undefined,
): BookPageAnimPickerValue {
  const anim = legadoPageAnimToTextViewer(value);
  return anim ?? 'default';
}

export function resolveBookTextViewerPageAnim(
  book: Book | null | undefined,
  uiDefault: TextViewerPageAnim,
): TextViewerPageAnim {
  const fromBook = legadoPageAnimToTextViewer(book?.readConfig?.pageAnim as number | undefined);
  return fromBook ?? normalizeTextViewerPageAnim(uiDefault);
}

export function normalizeLegadoPageAnim(value: unknown): LegadoPageAnimInt | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n < 0) return LEGADO_PAGE_ANIM_DEFAULT;
  if (n > 4) return undefined;
  return n as LegadoPageAnimInt;
}
