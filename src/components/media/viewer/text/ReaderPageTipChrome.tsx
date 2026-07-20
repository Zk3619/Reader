import type { JSX } from 'solid-js';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import type { ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import { readerTextContentSlotPaintStyle } from '@/components/media/viewer/text/reader-text-content-slot';
import { textViewerStore } from '@/stores/viewer';
import { cn } from '@/lib/utils';
import { ReaderPageTipBar } from './ReaderPageTipBar';

export interface ReaderPageTipChromeProps {
  tips: TextViewerPageTipsConfig;
  context: ReaderPageTipContext;
  chromeBarsVisible: boolean;
  themeId: number;
  /** 外层 content-frame 几何（按页 absolute inset 或滑动 padding） */
  layoutStyle?: Record<string, string>;
  frameRef?: (el: HTMLDivElement) => void;
  /** 页眉页脚之间的正文挂载区（用于分页实测） */
  bodyRef?: (el: HTMLDivElement) => void;
  class?: string;
  children: JSX.Element;
}

/** 页眉 + 正文槽 + 页脚纵向排列，正文不参与 tip 叠加 */
export function ReaderPageTipChrome(props: ReaderPageTipChromeProps) {
  const themeCls = () => readerThemeClasses(props.themeId);

  return (
    <div
      ref={props.frameRef}
      class={cn(
        'reader-page-tip-chrome absolute inset-0 z-2 box-border grid h-full w-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden',
        themeCls().text,
        props.class,
      )}
      style={{
        ...props.layoutStyle,
        ...readerTextContentSlotPaintStyle(textViewerStore.state.config),
      }}
    >
      <div class="reader-page-tip-header-slot min-h-0 shrink-0 row-1">
        <ReaderPageTipBar
          surface="reader"
          position="header"
          tips={props.tips}
          context={props.context}
          chromeBarsVisible={props.chromeBarsVisible}
          themeId={props.themeId}
        />
      </div>
      <div
        ref={props.bodyRef}
        class="reader-page-tip-body relative flex min-h-0 min-w-0 flex-col overflow-hidden overflow-x-clip row-2"
      >
        {props.children}
      </div>
      <div class="reader-page-tip-footer-slot min-h-0 shrink-0 row-3">
        <ReaderPageTipBar
          surface="reader"
          position="footer"
          tips={props.tips}
          context={props.context}
          chromeBarsVisible={props.chromeBarsVisible}
          themeId={props.themeId}
        />
      </div>
    </div>
  );
}
