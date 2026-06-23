/**
 * TextViewerUiConfig → Pretext canvas font 字符串（须与 CSS 一致）
 */

import { normalizeFontWeight, readerCustomFontFamilyName, resolveReaderFontFamily } from '@/lib/media/text/reader-font';
import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

/** macOS 上 system-ui 与 canvas 偏差大，映射到具名字体栈 */
const PRETEXT_CANVAS_FONT_STACK: Record<number, string> = {
  0: 'Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  1: 'Georgia, "Noto Serif SC", "Songti SC", serif',
  2: 'Consolas, "Cascadia Code", "Courier New", monospace',
};

export function pretextCanvasFontFamily(config: Pick<TextViewerUiConfig, 'font' | 'customFontName' | 'customFontPath'>): string {
  const preset = PRETEXT_CANVAS_FONT_STACK[config.font];
  if (preset) return preset;
  const resolved = resolveReaderFontFamily(config);
  if (/system-ui|var\(--font/i.test(resolved)) {
    return PRETEXT_CANVAS_FONT_STACK[0]!;
  }
  if (config.font === 3 || config.font === 4) {
    return readerCustomFontFamilyName(config);
  }
  return resolved;
}

export function pretextCanvasFont(
  config: Pick<TextViewerUiConfig, 'font' | 'customFontName' | 'customFontPath' | 'fontSize' | 'fontWeight'>,
  fontSizePx?: number,
): string {
  const size = fontSizePx ?? config.fontSize;
  const weight = normalizeFontWeight(config.fontWeight, 400);
  const family = pretextCanvasFontFamily(config);
  return `${weight} ${size}px ${family}`;
}

export function pretextChapterTitleFont(config: TextViewerUiConfig, titleSizePx: number): string {
  const weight = normalizeFontWeight(config.chapterTitleFontWeight, 600);
  const family = pretextCanvasFontFamily(config);
  return `${weight} ${titleSizePx}px ${family}`;
}
