/** Legado 风格：章节 → TextPage 列表（分页与渲染解耦） */

import type { ReaderLayoutSegment } from '@/lib/media/text/text-viewer-paginate';
import type { ReaderTextPageMeta } from '@/lib/media/text/reader-text-layout-entities';

/** canvas+dom：旧路径，保留类型兼容 */
export type ReaderChapterLayoutEngine =
  | 'canvas'
  | 'dom'
  | 'canvas+dom'
  | 'pretext'
  | 'stream'
  | 'epub-native';

/** 单页在章节文档坐标系中的区间（Y 向下，与 DOM 测量一致） */
export interface ReaderTextPage extends ReaderTextPageMeta {
  index: number;
  startY: number;
  endY: number;
  displayHeight: number;
}

export interface ReaderChapterLayout {
  chapterIndex: number;
  engine: ReaderChapterLayoutEngine;
  pages: ReaderTextPage[];
  pageStarts: number[];
  clipHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  contentExtent: number;
  /** 正文区上内边距（非外层容器外边距） */
  padTop: number;
  /** 正文区下内边距（非外层容器外边距） */
  padBottom: number;
  segments: ReaderLayoutSegment[];
  /** 是否双栏物理页（一屏左右两栏） */
  dualPage?: boolean;
  /** 双栏 spread 右栏首段 Y（与 pageStarts 等长） */
  rightPageStarts?: number[];
  /** 双栏：左/右栏归一化坐标系内容高度（Render clip extent） */
  leftColumnExtent?: number;
  rightColumnExtent?: number;
  /** 流式排版是否已完成 */
  isLayoutComplete?: boolean;
  /** 流式排版进度 0–1 */
  layoutProgress?: number;
  /** 章节 + 排版配置 + 视口 缓存键 */
  cacheKey: string;
}

export function pageCountFromChapterLayout(layout: ReaderChapterLayout): number {
  return Math.max(1, layout.pageStarts.length);
}
