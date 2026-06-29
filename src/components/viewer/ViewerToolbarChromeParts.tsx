import { Show } from 'solid-js';
import { Separator } from '@/components/ui/separator';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { cn } from '@/lib/utils';
import {
  useMediaViewerChromeFloating,
  useMediaViewerToolbarChromeClasses,
} from '@/lib/viewer/viewer-chrome-layout';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface ViewerToolbarWindowControlsProps {
  /** 是否在主题切换前显示分隔符（首行不显示） */
  showLeadingSeparator?: boolean;
  /** 强制隐藏（如移动端顶栏） */
  hidden?: boolean;
  class?: string;
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

  return (
    <Show when={!props.hidden}>
      {/* 断点显隐 class 与胶囊 flex 分离，避免 flex 覆盖 hidden */}
      <div class={cn('shrink-0', props.class)}>
        <div
          class={cn(
            'flex shrink-0 items-center no-drag',
            useCapsule() && floating.windowChromeCapsuleClass(),
          )}
          style={useCapsule() ? floating.overlaySurfaceStyle() : undefined}
        >
          <Show when={showSeparator()}>
            <Separator orientation="vertical" class="mx-1 h-6 max-sm:hidden sm:mx-2" />
          </Show>
          <div class="flex h-10 items-center gap-0.5 sm:gap-1">
            <ThemeSwitch
              withTooltip
              inViewerOverlay
              sizeClass={useCapsule() ? 'size-10' : undefined}
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
export function ViewerToolbarWindowControlsLead() {
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  return (
    <Show when={!isMobile()}>
      <ViewerToolbarWindowControls
        showLeadingSeparator={false}
        class={toolbarChrome().windowChromeLeadClass}
      />
    </Show>
  );
}

/** 桌面单行末尾：主题 + 窗口控件 */
export function ViewerToolbarWindowControlsTrail() {
  const toolbarChrome = useMediaViewerToolbarChromeClasses();
  return (
    <Show when={!isMobile()}>
      <ViewerToolbarWindowControls class={toolbarChrome().windowChromeTrailClass} />
    </Show>
  );
}
