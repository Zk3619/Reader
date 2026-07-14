/**
 * Popper 浮层内层滚动视口：
 * - 外框 popperMenuScrollFrame：固定上下 padding，内容从留白区边缘进入/退出
 * - 内轨 popperMenuScrollTrackBase + scrollGutter：仅此层滚动
 * 外层 Content 须用 popperMenuPanelShell（overflow-hidden p-0）。
 */

import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  popperMenuScrollFrame,
  popperMenuScrollTrackBase,
  scrollGutterClass,
  type ScrollGutterMode,
} from '@/lib/ui/viewport-classes';

export type { ScrollGutterMode };

export type PopperScrollViewportProps = {
  class?: string;
  children: JSX.Element;
  /**
   * 滚动条预留：
   * - both：两侧预留
   * - single：单侧预留
   * - auto：自动（默认，不提前占位）
   */
  scrollGutter?: ScrollGutterMode;
};

export function PopperScrollViewport(props: PopperScrollViewportProps) {
  const [local] = splitProps(props, ['class', 'children', 'scrollGutter']);
  return (
    <div class={cn(popperMenuScrollFrame, local.class)}>
      <div class={cn(popperMenuScrollTrackBase, scrollGutterClass(local.scrollGutter))}>
        {local.children}
      </div>
    </div>
  );
}
