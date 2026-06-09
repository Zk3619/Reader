import { cn } from '@/lib/utils';
import { scrollGutterStableBoth } from '@/lib/ui/viewport-classes';

/** 阅读记录页虚拟列表行高（含行间距；内容区对齐书架标准列表 h-28） */
export const READ_RECORD_ROW_GAP_PX = 8;
export const READ_RECORD_ROW_CONTENT_HEIGHT_PX = 112;
export const READ_RECORD_ROW_HEIGHT_PX =
  READ_RECORD_ROW_CONTENT_HEIGHT_PX + READ_RECORD_ROW_GAP_PX;

/** 阅读记录列表固定可见行数（最近在读 / 排行 / 归档） */
export const READ_RECORD_LIST_VISIBLE_ROWS = 5;

/** 双栏预览区固定展示行数 */
export const READ_RECORD_PREVIEW_VISIBLE_ROWS = READ_RECORD_LIST_VISIBLE_ROWS;
export const READ_RECORD_PREVIEW_LIST_HEIGHT_PX =
  READ_RECORD_ROW_HEIGHT_PX * READ_RECORD_PREVIEW_VISIBLE_ROWS;

/** 归档区日期分组标题行高 */
export const READ_RECORD_DATE_HEADER_HEIGHT_PX = 40;

/** 归档区虚拟列表可见行数 */
export const READ_RECORD_ARCHIVE_VISIBLE_ROWS = READ_RECORD_LIST_VISIBLE_ROWS;
export const READ_RECORD_ARCHIVE_LIST_HEIGHT_PX =
  READ_RECORD_ROW_HEIGHT_PX * READ_RECORD_ARCHIVE_VISIBLE_ROWS;

/** 双栏预览虚拟列表固定高度 class */
export const READ_RECORD_PREVIEW_LIST_HEIGHT_CLASS = 'h-[var(--read-record-preview-list-height)]';
export const READ_RECORD_PREVIEW_LIST_MAX_HEIGHT_CLASS =
  'max-h-[var(--read-record-preview-list-height)]';

/** 归档虚拟列表固定高度 class */
export const READ_RECORD_ARCHIVE_LIST_HEIGHT_CLASS = 'h-[var(--read-record-archive-list-height)]';
export const READ_RECORD_ARCHIVE_LIST_MAX_HEIGHT_CLASS =
  'max-h-[var(--read-record-archive-list-height)]';

/** 阅读记录虚拟列表滚动容器（保留 scroll-gutter，避免滚动条裁切行内操作区） */
export const READ_RECORD_VIRTUAL_LIST_CLASS = cn(
  '!flex-none h-full min-h-0',
  scrollGutterStableBoth,
);

/** 虚拟列表行外层：右侧留白（行间距由 entry 行自行追加 pb-2） */
export const READ_RECORD_VIRTUAL_LIST_ITEM_CLASS = 'box-border h-full pr-1';

/** 与设置页设置项一致的外层卡片 */
export const READ_RECORD_SECTION_CARD_CLASS =
  'rounded-2xl border border-border/50 bg-card p-6';

export function readRecordEntryKey(
  bookName: string,
  bookAuthor: string,
): string {
  return `${bookName}\0${bookAuthor ?? ''}`;
}
