/**
 * 书源列表虚拟行尺寸（对齐迁移前 space-y-2 / py-2.5 / h-12 等样式）
 */

/** 列表项间距，等同 Tailwind `space-y-2` */
export const SOURCE_LIST_ROW_GAP_PX = 8;

/** 书源管理卡片 `h-12` */
export const SOURCE_MANAGE_CARD_HEIGHT_PX = 48;

/** 书源管理虚拟行槽：卡片 + 行间距 */
export const SOURCE_MANAGE_LIST_ROW_HEIGHT_PX =
  SOURCE_MANAGE_CARD_HEIGHT_PX + SOURCE_LIST_ROW_GAP_PX;

/** 书源页卡片内容区（`py-2.5`，非 `h-12`） */
export const SOURCE_PAGE_CARD_HEIGHT_PX = 40;

/** 书源页虚拟行槽：卡片 + 行间距 */
export const SOURCE_PAGE_LIST_ROW_HEIGHT_PX =
  SOURCE_PAGE_CARD_HEIGHT_PX + SOURCE_LIST_ROW_GAP_PX;

/** 分组标题：首组无 `pt-2` */
export const SOURCE_LIST_GROUP_HEADER_FIRST_HEIGHT_PX = 26;

/** 分组标题：`pt-2` + 标题 + `pb-1.5` */
export const SOURCE_LIST_GROUP_HEADER_HEIGHT_PX = 34;

export type SourceListRowKind = { type: 'header' | 'source' | string };

export function isFirstGroupHeaderRow(
  rows: readonly SourceListRowKind[],
  index: number,
): boolean {
  if (rows[index]?.type !== 'header') return false;
  for (let i = 0; i < index; i++) {
    if (rows[i]?.type === 'header') return false;
  }
  return true;
}

export function estimateSourceManageListRowSize(
  rows: readonly SourceListRowKind[],
  index: number,
  sourceRowHeightPx: number,
): number {
  const row = rows[index];
  if (!row) return sourceRowHeightPx;
  if (row.type === 'header') {
    return isFirstGroupHeaderRow(rows, index)
      ? SOURCE_LIST_GROUP_HEADER_FIRST_HEIGHT_PX
      : SOURCE_LIST_GROUP_HEADER_HEIGHT_PX;
  }
  return sourceRowHeightPx;
}
