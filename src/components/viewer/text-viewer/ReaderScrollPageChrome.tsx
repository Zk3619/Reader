import type { JSX } from 'solid-js';
import { createMemo } from 'solid-js';
import { ReaderPageTipBar } from '@/components/viewer/text-viewer/ReaderPageTipBar';
import type { ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import { textViewerThemeStyle } from '@/lib/theme/TextViewerTheme';
import { textViewerStore } from '@/stores/viewer';
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

  const scrollClass = createMemo(() =>
    cn(
      'reader-scroll-page-body min-h-0 flex-1 overflow-x-clip overflow-y-auto scroll-gutter-stable-both',
      themeCls().bg,
      themeCls().text,
      props.class,
    ),
  );

  const themeSurfaceStyle = () =>
    textViewerThemeStyle(props.themeId, {
      themeSurfaceAppearance: textViewerStore.state.config.themeSurfaceAppearance,
    });

  return (
    <div
      class={cn(
        'reader-scroll-page-chrome flex h-full min-h-0 w-full flex-col overflow-hidden',
        themeCls().bg,
        themeCls().text,
      )}
      style={themeSurfaceStyle()}
    >
      <ReaderPageTipBar
        surface="reader"
        position="header"
        tips={props.tips}
        context={props.context}
        chromeBarsVisible={props.chromeBarsVisible}
        themeId={props.themeId}
      />
      <div
        ref={props.scrollRef}
        class={scrollClass()}
        style={themeSurfaceStyle()}
      >
        {props.children}
      </div>
      <ReaderPageTipBar
        surface="reader"
        position="footer"
        tips={props.tips}
        context={props.context}
        chromeBarsVisible={props.chromeBarsVisible}
        themeId={props.themeId}
      />
    </div>
  );
}
