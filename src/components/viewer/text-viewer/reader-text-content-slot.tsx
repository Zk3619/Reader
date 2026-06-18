/**
 * 正文内容槽：滚动 / 按页统一由 content-slot 承担四边 inset
 */

import { type JSX } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import type { TextViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import { textViewerPagedContentInsets } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import { cn } from '@/lib/utils';

/** 滚动模式：slot 在滚动容器内，用 padding 留白 */
export function readerTextContentSlotPaddingStyle(
  inset: TextViewerPagedContentInsets,
): Record<string, string> {
  return {
    'padding-top': `${inset.top}px`,
    'padding-bottom': `${inset.bottom}px`,
    'padding-left': `${inset.left}px`,
    'padding-right': `${inset.right}px`,
  };
}

/** 滚动模式且外层已有页眉页脚：slot 仅保留左右留白 */
export function readerTextContentSlotHorizontalPaddingStyle(
  inset: TextViewerPagedContentInsets,
): Record<string, string> {
  return {
    'padding-top': '0px',
    'padding-bottom': '0px',
    'padding-left': `${inset.left}px`,
    'padding-right': `${inset.right}px`,
  };
}

/** 按页模式：slot 绝对定位，与 page-window 几何对齐 */
export function readerTextContentSlotAbsoluteStyle(
  inset: TextViewerPagedContentInsets,
): Record<string, string> {
  return {
    top: `${inset.top}px`,
    bottom: `${inset.bottom}px`,
    left: `${inset.left}px`,
    right: `${inset.right}px`,
  };
}

/** 按页 content-frame：贴视口四边，水平由页眉/页脚自身 inset 控制 */
export function readerTextContentSlotPagedFrameStyle(): Record<string, string> {
  return {
    top: '0px',
    bottom: '0px',
    left: '0px',
    right: '0px',
    'padding-top': '0px',
    'padding-bottom': '0px',
    'padding-left': '0px',
    'padding-right': '0px',
  };
}

/** 按页正文区（页眉页脚之间）：用于翻页幕帘等与正文对齐的挂载点 */
export function readerTextContentSlotPagedBodyMountStyle(
  inset: TextViewerPagedContentInsets,
  tipPads: { top: number; bottom: number },
): Record<string, string> {
  return {
    top: `${tipPads.top}px`,
    bottom: `${tipPads.bottom}px`,
    left: `${inset.left}px`,
    right: `${inset.right}px`,
    'padding-top': '0px',
    'padding-bottom': '0px',
    'padding-left': '0px',
    'padding-right': '0px',
  };
}

/** 按页模式：slot 绝对定位，与 page-window 几何对齐（显式清零 padding） */
export function readerTextContentSlotPagedMountStyle(
  inset: TextViewerPagedContentInsets,
): Record<string, string> {
  return {
    ...readerTextContentSlotAbsoluteStyle(inset),
    'padding-top': '0px',
    'padding-bottom': '0px',
    'padding-left': '0px',
    'padding-right': '0px',
  };
}

/** 滑动翻页：满视口面板；水平留白由正文槽 padding 承担，不与页眉/页脚叠加 */
export function readerTextContentSlotSlidePanelStyle(): Record<string, string> {
  return readerTextContentSlotPagedFrameStyle();
}

const SLOT_LAYOUT_KEYS = [
  'top',
  'right',
  'bottom',
  'left',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
] as const;

/** imperative 恢复 slot 几何（Solid style 切换后清残留） */
export function applyReaderTextContentSlotLayoutStyle(
  el: HTMLElement,
  style: Record<string, string>,
): void {
  for (const key of SLOT_LAYOUT_KEYS) {
    el.style.setProperty(key, style[key] ?? '');
  }
}

export interface ReaderTextContentSlotProps {
  mode: 'scroll' | 'paged';
  /** 滚动模式：页眉页脚由外层 chrome 承担，slot 仅左右 inset */
  tipChromeOuter?: boolean;
  class?: string;
  style?: Record<string, string | number>;
  ref?: (el: HTMLDivElement) => void;
  children: JSX.Element;
}

export function ReaderTextContentSlot(props: ReaderTextContentSlotProps) {
  const inset = () => textViewerPagedContentInsets(textViewerStore.state.config);
  const theme = () => readerThemeClasses(textViewerStore.state.config.theme);
  const slotStyle = () => {
    const pads = inset();
    const base =
      props.mode === 'scroll'
        ? props.tipChromeOuter
          ? readerTextContentSlotHorizontalPaddingStyle(pads)
          : readerTextContentSlotPaddingStyle(pads)
        : readerTextContentSlotPagedMountStyle(pads);
    return props.style ? { ...base, ...props.style } : base;
  };

  return (
    <div
      ref={props.ref}
      class={cn(
        'reader-text-content-slot',
        props.mode === 'paged' && 'absolute overflow-hidden box-border',
        props.mode === 'scroll' && 'min-h-full w-full max-w-full box-border overflow-x-clip',
        props.mode === 'scroll' && theme().bg,
        props.mode === 'scroll' && theme().text,
        props.class,
      )}
      style={slotStyle()}
    >
      {props.children}
    </div>
  );
}
