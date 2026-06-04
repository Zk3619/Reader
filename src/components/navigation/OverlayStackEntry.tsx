import type { Accessor, JSX } from 'solid-js';
import type { OverlayEntry } from '@/lib/navigation/overlay-stack';
import { isViewerOverlayKind } from '@/lib/navigation/overlay-stack';
import { APP_OVERLAY_VIEWER_Z, APP_SHELL_CHROME_Z } from '@/lib/ui/overlay-z';
import { cn } from '@/lib/utils';

export interface OverlayStackEntryProps {
  entry: OverlayEntry;
  /** 当前栈顶 entry.id（独立 Accessor，确保 For 子项随栈顶更新） */
  topId: Accessor<string | undefined>;
  children: JSX.Element;
}

/**
 * 导航叠层栈单条条目的可见性壳层。
 * 阅读器 Portal 宿主由 publishActiveOverlayLayer(nav.top()) 统一开关。
 */
export function OverlayStackEntry(props: OverlayStackEntryProps) {
  const visible = () => props.topId() === props.entry.id;
  const isViewer = () => isViewerOverlayKind(props.entry.kind);

  return (
    <div
      class={cn(
        'fixed inset-0',
        isViewer() ? APP_OVERLAY_VIEWER_Z : APP_SHELL_CHROME_Z,
      )}
      style={{
        display: visible() ? 'block' : 'none',
        'pointer-events': visible() ? 'auto' : 'none',
      }}
      aria-hidden={visible() ? 'false' : 'true'}
      data-overlay-kind={props.entry.kind}
      data-overlay-visible={visible() ? 'true' : 'false'}
    >
      {props.children}
    </div>
  );
}
