/**
 * Popper 浮层内层滚动视口：
 * - 外框 popperMenuScrollFrame：固定上下 padding，内容从留白区边缘进入/退出
 * - 内轨 popperMenuScrollTrack：仅此层滚动
 * 外层 Content 须用 popperMenuPanelShell（overflow-hidden p-0）。
 */

import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import { popperMenuScrollFrame, popperMenuScrollTrack } from '@/lib/ui/viewport-classes';

export type PopperScrollViewportProps = {
  class?: string;
  children: JSX.Element;
};

export function PopperScrollViewport(props: PopperScrollViewportProps) {
  const [local] = splitProps(props, ['class', 'children']);
  return (
    <div class={cn(popperMenuScrollFrame, local.class)}>
      <div class={popperMenuScrollTrack}>{local.children}</div>
    </div>
  );
}
