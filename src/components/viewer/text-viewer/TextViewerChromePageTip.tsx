import { Show } from 'solid-js';
import { readerPageTipBarMountedInChrome, type ReaderPageTipContext } from '@/lib/media/text/reader-page-tip';
import type { TextViewerPageTipsConfig } from '@/lib/media/text/reader-ui-config';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import { cn } from '@/lib/utils';
import { useMediaViewerChromeFloating } from '@/lib/viewer/viewer-chrome-layout';
import {
  pageTipBackgroundFollowsPage,
  textViewerChromeFollowPagePaletteStyle,
  textViewerChromeFollowPageSurfaceStyle,
  textViewerFloatingCapsuleBoxShadow,
} from '@/lib/theme/TextViewerTheme';
import { mergeViewerChromeFloatingCapsuleStyle } from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import { textViewerStore } from '@/stores/viewer';
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
  const floating = useMediaViewerChromeFloating();
  const themeCls = () => readerThemeClasses(props.themeId);
  const mounted = () => readerPageTipBarMountedInChrome(props.position, props.tips);

  const themeAppearanceConfig = () => ({
    themeSurfaceAppearance: textViewerStore.state.config.themeSurfaceAppearance,
  });

  const shellStyle = () => {
    const config = themeAppearanceConfig();
    if (!floating.isFloating()) {
      if (!pageTipBackgroundFollowsPage(props.tips)) return undefined;
      return textViewerChromeFollowPageSurfaceStyle(props.themeId, config, 'pageTip');
    }
    const followBg = pageTipBackgroundFollowsPage(props.tips);
    const base = followBg
      ? textViewerChromeFollowPagePaletteStyle(props.themeId)
      : floating.overlaySurfaceStyle();
    return mergeViewerChromeFloatingCapsuleStyle(base, {
      themeId: props.themeId,
      followPage: followBg,
      surfaceKind: 'pageTip',
      config,
      boxShadow: textViewerFloatingCapsuleBoxShadow(props.themeId, followBg),
    });
  };

  return (
    <Show when={mounted()}>
      <div
        class={cn(
          'reader-chrome-page-tip shrink-0 overflow-hidden',
          props.position === 'header' ? 'reader-chrome-page-tip-header' : 'reader-chrome-page-tip-footer',
          !floating.isFloating() && themeCls().bg,
          !floating.isFloating() && themeCls().text,
          floating.isFloating() && cn(floating.wideBlockClass(), 'border-0'),
          pageTipBackgroundFollowsPage(props.tips) && 'reader-chrome-follow-page',
          props.class,
        )}
        style={shellStyle()}
      >
        <ReaderPageTipBar
          surface="chrome"
          position={props.position}
          tips={props.tips}
          context={props.context}
          chromeBarsVisible={props.chromeBarsVisible}
          themeId={props.themeId}
        />
      </div>
    </Show>
  );
}
