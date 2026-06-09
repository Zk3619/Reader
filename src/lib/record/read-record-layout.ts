/** 阅读记录页虚拟列表行高（含行间距；内容区对齐书架标准列表 h-28） */
export const READ_RECORD_ROW_GAP_PX = 8;
export const READ_RECORD_ROW_CONTENT_HEIGHT_PX = 112;
export const READ_RECORD_ROW_HEIGHT_PX =
  READ_RECORD_ROW_CONTENT_HEIGHT_PX + READ_RECORD_ROW_GAP_PX;

/** 双栏预览区固定展示行数 */
export const READ_RECORD_PREVIEW_VISIBLE_ROWS = 5;
export const READ_RECORD_PREVIEW_LIST_HEIGHT_PX =
  READ_RECORD_ROW_HEIGHT_PX * READ_RECORD_PREVIEW_VISIBLE_ROWS;

/** 归档区日期分组标题行高 */
export const READ_RECORD_DATE_HEADER_HEIGHT_PX = 40;

/** 归档区虚拟列表可见行数（含日期头与条目混合计量为条目槽位） */
export const READ_RECORD_ARCHIVE_VISIBLE_ROWS = 8;
export const READ_RECORD_ARCHIVE_LIST_HEIGHT_PX =
  READ_RECORD_ROW_HEIGHT_PX * READ_RECORD_ARCHIVE_VISIBLE_ROWS;

/** 双栏预览虚拟列表固定高度 class */
export const READ_RECORD_PREVIEW_LIST_HEIGHT_CLASS = 'h-[var(--read-record-preview-list-height)]';

/** 归档虚拟列表固定高度 class */
export const READ_RECORD_ARCHIVE_LIST_HEIGHT_CLASS = 'h-[var(--read-record-archive-list-height)]';

/** 与设置页设置项一致的外层卡片 */
export const READ_RECORD_SECTION_CARD_CLASS =
  'rounded-2xl border border-border/50 bg-card p-6';

export function readRecordEntryKey(
  bookName: string,
  bookAuthor: string,
): string {
  return `${bookName}\0${bookAuthor ?? ''}`;
}
