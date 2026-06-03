/**
 * Legado FlexChildStyle → CSS（书源发现区 / loginUi 等 flex 子项）
 * @see legado-own FlexChildStyle.kt、ExploreAdapter.upKindList
 */

import type { ExploreSection, ExploreSectionStyle } from '@/lib/book-source/explore-sections';

/** 发现区无 style 或 layout_flexBasisPercent < 0 时默认占 1/3 宽（三列） */
export const EXPLORE_KIND_DEFAULT_BASIS_PERCENT = 1 / 3;

/** 书源发现抽屉布局：默认按脚本 style；Legado 兼容强制三列 */
export type ExploreDrawerLayoutScheme = 'default' | 'legado';

/** Legado 兼容方案每行最多列数 */
export const EXPLORE_DRAWER_MAX_COLUMNS = 3;

function formatBasisCssPercent(ratio: number): string {
  const pct = ratio * 100;
  const rounded = Math.round(pct * 1000) / 1000;
  return `${rounded}%`;
}

function resolveBasisPercent(
  style: ExploreSectionStyle | undefined,
  defaultBasisPercent: number,
): number {
  const basis = style?.layout_flexBasisPercent;
  if (typeof basis !== 'number' || basis < 0) return defaultBasisPercent;
  return basis <= 1 ? basis : basis / 100;
}

/** 单项在 flex 行内占宽比例（0–1）；Legado 方案无 style 时默认 1/3 */
export function resolveExploreSectionBasisRatio(
  style: ExploreSectionStyle | undefined,
  scheme: ExploreDrawerLayoutScheme = 'legado',
): number {
  const defaultBasis =
    scheme === 'legado' ? EXPLORE_KIND_DEFAULT_BASIS_PERCENT : 0;
  const basis = style?.layout_flexBasisPercent;
  if (typeof basis !== 'number' || basis < 0) {
    return scheme === 'legado' ? defaultBasis : 0;
  }
  return basis <= 1 ? basis : basis / 100;
}

const ROW_WIDTH_EPS = 0.001;

function flushExploreRow(
  rows: ExploreSection[][],
  current: ExploreSection[],
): ExploreSection[] {
  if (current.length) rows.push(current);
  return [];
}

/**
 * 按 Legado flexBasis 分行；Legado 方案每行最多三列。
 * 默认方案仅按宽度换行，不强制列数。
 */
export function groupExploreSectionsIntoRows(
  sections: ExploreSection[],
  scheme: ExploreDrawerLayoutScheme = 'legado',
): ExploreSection[][] {
  const rows: ExploreSection[][] = [];
  let current: ExploreSection[] = [];
  let rowSum = 0;
  const maxColumns = scheme === 'legado' ? EXPLORE_DRAWER_MAX_COLUMNS : Number.POSITIVE_INFINITY;

  for (const section of sections) {
    const basis = resolveExploreSectionBasisRatio(section.style, scheme);
    const isFullWidth = basis >= 1 - ROW_WIDTH_EPS;
    const isAutoWidth = scheme === 'default' && basis <= ROW_WIDTH_EPS;

    if (isFullWidth) {
      current = flushExploreRow(rows, current);
      rowSum = 0;
      rows.push([section]);
      continue;
    }

    if (isAutoWidth) {
      current = flushExploreRow(rows, current);
      rowSum = 0;
      rows.push([section]);
      continue;
    }

    const widthOverflow = rowSum + basis > 1 + ROW_WIDTH_EPS && current.length > 0;
    const columnOverflow = current.length >= maxColumns;
    if (widthOverflow || columnOverflow) {
      current = flushExploreRow(rows, current);
      rowSum = 0;
    }
    current.push(section);
    rowSum += basis;
  }
  flushExploreRow(rows, current);
  return rows;
}

/** 默认方案：完全按脚本 style，无占比时用内容宽度 */
export function exploreDrawerDefaultItemStyle(section: ExploreSection): Record<string, string> {
  const style = section.style;
  const basis = style?.layout_flexBasisPercent;
  const grow = style?.layout_flexGrow;
  const css: Record<string, string> = {
    minWidth: '0',
    boxSizing: 'border-box',
    maxWidth: '100%',
  };

  if (typeof basis === 'number' && basis >= 0) {
    const ratio = basis <= 1 ? basis : basis / 100;
    css.flexBasis = formatBasisCssPercent(ratio);
    css.flexShrink = '0';
    css.width = css.flexBasis;
    css.maxWidth = css.flexBasis;
    css.flexGrow = typeof grow === 'number' ? String(grow) : '0';
    return css;
  }

  css.flexBasis = 'auto';
  css.flexShrink = '1';
  css.flexGrow = typeof grow === 'number' ? String(grow) : '0';
  return css;
}

/** 抽屉单行子项：行内脚本占比合计 < 100% 时等分撑满；否则按脚本占比分配 flex-grow */
export function exploreDrawerRowItemStyle(
  section: ExploreSection,
  row: ExploreSection[],
  scheme: ExploreDrawerLayoutScheme = 'legado',
): Record<string, string> {
  const basis = resolveExploreSectionBasisRatio(section.style, scheme);
  const rowSum = row.reduce(
    (sum, item) => sum + resolveExploreSectionBasisRatio(item.style, scheme),
    0,
  );
  let weight: number;
  if (row.length === 1) {
    weight = 1;
  } else if (rowSum < 1 - ROW_WIDTH_EPS) {
    weight = 1 / row.length;
  } else {
    weight = rowSum > 0 ? basis / rowSum : 1 / row.length;
  }
  const scriptGrow = section.style?.layout_flexGrow;
  const flexGrow =
    typeof scriptGrow === 'number' && scriptGrow > 0 ? scriptGrow : Math.max(weight, 0.001);
  return {
    flex: `${flexGrow} 1 0`,
    minWidth: '0',
    boxSizing: 'border-box',
  };
}

/** 将书源项 style 转为 flex 子项 CSS（与 Legado FlexboxLayout 一致） */
export function legadoFlexChildStyleToCss(
  style: ExploreSectionStyle | undefined,
  options?: { defaultBasisPercent?: number },
): Record<string, string> {
  const defaultBasis = options?.defaultBasisPercent ?? EXPLORE_KIND_DEFAULT_BASIS_PERCENT;
  const css: Record<string, string> = {
    minWidth: '0',
    boxSizing: 'border-box',
  };

  const grow = style?.layout_flexGrow;
  if (typeof grow === 'number') css.flexGrow = String(grow);

  const basisPct = resolveBasisPercent(style, defaultBasis);
  css.flexBasis = formatBasisCssPercent(basisPct);
  css.flexShrink = '0';
  if (typeof grow !== 'number') css.flexGrow = '0';

  return css;
}

/** 按百分比占位、避免被内容撑开（对齐 SourceLoginDialog.buttonWrapperStyle） */
export function legadoFlexChildWrapperStyle(
  style: ExploreSectionStyle | undefined,
  options?: { defaultBasisPercent?: number },
): Record<string, string> {
  const css = legadoFlexChildStyleToCss(style, options);
  const basis = css.flexBasis;
  if (basis) {
    css.width = basis;
    css.maxWidth = basis;
  }
  return css;
}

/** Legado item_fillet_text / selector_fillet_btn_bg */
export const LEGADO_FILLET_CHIP_CLASS =
  'inline-flex min-h-7 w-full max-w-full items-center justify-center rounded-full border border-border/60 bg-background/80 px-3 py-1 text-center text-sm font-normal text-foreground shadow-sm transition-colors hover:bg-accent/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

/** Legado item_fillet_selector_single 外壳 */
export const LEGADO_FILLET_SELECT_SHELL_CLASS =
  'flex w-full min-w-0 items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-sm shadow-sm';
