import type { JSX } from 'solid-js';
import { createMemo } from 'solid-js';
import { ReaderPageTipBar } from '@/components/viewer/text-viewer/ReaderPageTipBar';
import type { ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses, readerThemePalette } from '@/lib/media/text/reader-theme-classes';
import { cn } from '@/lib/utils';

export interface ReaderScrollPageChromeProps {
  tips: TextViewerPageTipsConfig;
  context: ReaderPageTipContext;
  chromeBarsVisible: boolean;
  themeId: number;
  scrollRef?: (el: HTMLDivElement) => void;
  class?: string;
  children: JSX.Element;
}

/** 滚动模式：页眉 + 可滚动正文 + 页脚 */
export function ReaderScrollPageChrome(props: ReaderScrollPageChromeProps) {
  const themeCls = () => readerThemeClasses(props.themeId);
  const contentColor = () => readerThemePalette(props.themeId).text;
  const pageBg = () => readerThemePalette(props.themeId).bg;

  const scrollClass = createMemo(() =>
    cn(
      'reader-scroll-page-body min-h-0 flex-1 overflow-x-clip overflow-y-auto scroll-gutter-stable-both',
      themeCls().bg,
      themeCls().text,
      props.class,
    ),
  );

  return (
    <div
      class={cn(
        'reader-scroll-page-chrome flex h-full min-h-0 w-full flex-col overflow-hidden',
        themeCls().bg,
        themeCls().text,
      )}
      style={{ 'background-color': pageBg() }}
    >
      <ReaderPageTipBar
        position="header"
        tips={props.tips}
        context={props.context}
        chromeBarsVisible={props.chromeBarsVisible}
        contentColor={contentColor()}
      />
      <div
        ref={props.scrollRef}
        class={scrollClass()}
        style={{ 'background-color': pageBg() }}
      >
        {props.children}
      </div>
      <ReaderPageTipBar
        position="footer"
        tips={props.tips}
        context={props.context}
        chromeBarsVisible={props.chromeBarsVisible}
        contentColor={contentColor()}
      />
    </div>
  );
}
