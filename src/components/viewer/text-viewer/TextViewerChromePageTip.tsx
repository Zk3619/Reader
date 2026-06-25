import { Show } from 'solid-js';
import { readerPageTipBarMountedInChrome, type ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses, readerThemePalette } from '@/lib/media/text/reader-theme-classes';
import { cn } from '@/lib/utils';
import { ReaderPageTipBar } from './ReaderPageTipBar';

export interface TextViewerChromePageTipProps {
  position: 'header' | 'footer';
  tips: TextViewerPageTipsConfig;
  context: ReaderPageTipContext;
  chromeBarsVisible: boolean;
  themeId: number;
  class?: string;
}

/** 顶/底操作栏内的页眉/页脚（仅跟随模式；与阅读器内 always 条视觉一致） */
export function TextViewerChromePageTip(props: TextViewerChromePageTipProps) {
  const themeCls = () => readerThemeClasses(props.themeId);
  const contentColor = () => readerThemePalette(props.themeId).text;
  const pageBg = () => readerThemePalette(props.themeId).bg;
  const mounted = () => readerPageTipBarMountedInChrome(props.position, props.tips);

  return (
    <Show when={mounted()}>
      <div
        class={cn(
          props.position === 'header'
            ? 'reader-chrome-page-tip reader-chrome-page-tip-header shrink-0 border-t border-border/40'
            : 'reader-chrome-page-tip reader-chrome-page-tip-footer shrink-0 border-b border-border/40',
          themeCls().bg,
          themeCls().text,
          props.class,
        )}
        style={{ 'background-color': pageBg() }}
      >
        <ReaderPageTipBar
          surface="chrome"
          position={props.position}
          tips={props.tips}
          context={props.context}
          chromeBarsVisible={props.chromeBarsVisible}
          contentColor={contentColor()}
        />
      </div>
    </Show>
  );
}
