/**
 * @deprecated 类型保留供 compat；实现已迁至 pretext-chapter-layout
 */

import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export interface CanvasTextLayoutParams {
  chapterIndex: number;
  raw: string;
  chapterTitle?: string;
  viewportWidth: number;
  viewportHeight: number;
  config: TextViewerUiConfig;
  cacheKey: string;
  padTop?: number;
  padBottom?: number;
  clipHeightPx?: number;
  horizontalInsetOnSlot?: boolean;
}
