import { Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { Separator } from '@/components/ui/separator';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { cn } from '@/lib/utils';
import {
  useMediaViewerChromeFloating,
  useMediaViewerToolbarChromeClasses,
} from '@/lib/viewer/viewer-chrome-layout';
import { isMobile, isTauri } from '@/lib/platform/detect';
import { mergeViewerChromeFloatingCapsuleStyle } from '@/lib/viewer/media-viewer-chrome-overlay-appearance';
import {
  textViewerChromeFollowPagePaletteStyle,
  textViewerFloatingCapsuleBoxShadow,
} from '@/lib/theme/TextViewerTheme';
import type { TextViewerThemeAppearanceConfig } from '@/lib/media/text/reader-ui-config';

export interface ViewerToolbarWindowControlsProps {
  /** 是否在主题切换前显示分隔符（首行不显示） */
  showLeadingSeparator?: boolean;
  /** 强制隐藏（如移动端顶栏） */
  hidden?: boolean;
  class?: string;
  /** 继承父级顶栏 chrom 文字/悬停色（阅读器顶栏跟随页面时） */
  inheritChromeColors?: boolean;
  /** 阅读主题 id（跟随页面时用于胶囊光晕） */
  themeId?: number;
  /** 商业级主题 surface 外观覆盖 */
  themeSurfaceAppearance?: TextViewerThemeAppearanceConfig;
}

/** 主题切换 + 窗口控件（始终成组） */
export function ViewerToolbarWindowControls(props: ViewerToolbarWindowControlsProps) {
  const floating = useMediaViewerChromeFloating();
  const useCapsule = () => floating.isFloating();
  const showSeparator = () =>
    props.showLeadingSeparator !== false &&
    isTauri() &&
    !isMobile() &&
    !floating.isFloating();

  const capsuleStyle = (): JSX.CSSProperties | undefined => {
    if (!useCapsule()) return undefined;
    const follow = props.inheritChromeColors === true;
    const themeId = props.themeId ?? 0;
    const base = follow
      ? textViewerChromeFollowPagePaletteStyle(themeId)
      : floating.overlaySurfaceStyle();
    return mergeViewerChromeFloatingCapsuleStyle(base, {
      themeId,
      followPage: follow,
      surfaceKind: 'chrome',
      config: { themeSurfaceAppearance: props.themeSurfaceAppearance },
      boxShadow: textViewerFloatingCapsuleBoxShadow(themeId, follow),
    });
  };

  return (
    <Show when={!props.hidden}>
      {/* 断点显隐 class 与胶囊 flex 分离，避免 flex 覆盖 hidden */}
      <div class={cn('shrink-0', props.class)}>
        <div
          class={cn(
            'flex shrink-0 items-center no-drag',
            useCapsule() && floating.windowChromeCapsuleClass(),
            props.inheritChromeColors && 'reader-chrome-follow-page text-inherit',
          )}
          style={capsuleStyle()}
        >
          <Show when={showSeparator()}>
            <Separator
              orientation="vertical"
              class={cn(
                'mx-1 h-6 max-sm:hidden sm:mx-2',
                props.inheritChromeColors ? 'bg-current opacity-30' : undefined,
              )}
            />
          </Show>
          <div class="flex h-9 items-center gap-0.5 sm:gap-1">
            <ThemeSwitch
              withTooltip
              inViewerOverlay
              inheritChromeColors={props.inheritChromeColors}
              sizeClass={useCapsule() ? 'size-9' : undefined}
            />
            <Show when={isTauri() && !isMobile()}>
              <WindowControlButtons />
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}

/** 桌面双行首行右侧：主题 + 窗口控件 */
export function ViewerToolbarWindowControlsLead(
  props: Pick<
    ViewerToolbarWindowControlsProps,
    'inheritChromeColors' | 'themeId' | 'themeSurfaceAppearance'
  > = {},
) {
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  return (
    <Show when={!isMobile()}>
      <ViewerToolbarWindowControls
        showLeadingSeparator={false}
        class={toolbarChrome().windowChromeLeadClass}
        inheritChromeColors={props.inheritChromeColors}
        themeId={props.themeId}
        themeSurfaceAppearance={props.themeSurfaceAppearance}
      />
    </Show>
  );
}

/** 桌面单行末尾：主题 + 窗口控件 */
export function ViewerToolbarWindowControlsTrail(
  props: Pick<
    ViewerToolbarWindowControlsProps,
    'inheritChromeColors' | 'themeId' | 'themeSurfaceAppearance'
  > = {},
) {
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  return (
    <Show when={!isMobile()}>
      <ViewerToolbarWindowControls
        class={toolbarChrome().windowChromeTrailClass}
        inheritChromeColors={props.inheritChromeColors}
        themeId={props.themeId}
        themeSurfaceAppearance={props.themeSurfaceAppearance}
      />
    </Show>
  );
}
