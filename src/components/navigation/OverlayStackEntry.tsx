import { createEffect, type Accessor, type JSX } from 'solid-js';
import type { OverlayEntry } from '@/lib/navigation/overlay-stack';
import { isViewerOverlayKind } from '@/lib/navigation/overlay-stack';
import { APP_OVERLAY_VIEWER_Z, APP_SHELL_CHROME_Z } from '@/lib/ui/overlay-z';
import { overlayStackFadeShellClass } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { settingsState } from '@/stores/settings';

export interface OverlayStackEntryProps {
  entry: OverlayEntry;
  /** 当前栈顶 entry.id（独立 Accessor，确保 For 子项随栈顶更新） */
  topId: Accessor<string | undefined>;
  children: JSX.Element;
}

/**
 * 导航叠层栈单条条目的可见性壳层。
 * 阅读器 Portal 宿主由 publishActiveOverlayLayer(nav.top()) 统一开关。
 *
 * - 阅读器/媒体全屏叠层：即时显隐（display），阅读器内不做壳层 fade
 * - 其它独立页：200ms 纯 opacity 淡入淡出（受「减少动效」控制）
 */
export function OverlayStackEntry(props: OverlayStackEntryProps) {
  const visible = () => props.topId() === props.entry.id;
  const isViewer = () => isViewerOverlayKind(props.entry.kind);
  const reduceMotion = () => settingsState.app.reduceMotion;
  const fadeShell = () => !reduceMotion() && !isViewer();
  let shellEl: HTMLDivElement | undefined;

  createEffect(() => {
    shellEl?.setAttribute('aria-hidden', visible() ? 'false' : 'true');
  });

  return (
    <div
      ref={shellEl}
      class={cn(
        'fixed inset-0',
        isViewer() ? APP_OVERLAY_VIEWER_Z : APP_SHELL_CHROME_Z,
        overlayStackFadeShellClass(reduceMotion(), isViewer()),
      )}
      style={
        fadeShell()
          ? undefined
          : {
              display: visible() ? 'block' : 'none',
              'pointer-events': visible() ? 'auto' : 'none',
            }
      }
      data-overlay-kind={props.entry.kind}
      data-overlay-visible={visible() ? 'true' : 'false'}
    >
      {props.children}
    </div>
  );
}
