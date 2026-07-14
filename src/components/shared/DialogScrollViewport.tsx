/**
 * 弹窗内滚动视口：外框固定上下留白，内轨滚动（与 PopperScrollViewport 同思路）。
 */

import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  dialogNestedScrollFrame,
  dialogNestedScrollTrack,
  dialogScrollFrameFlex,
  dialogScrollTrack,
  scrollGutterClass,
  type ScrollGutterMode,
} from '@/lib/ui/viewport-classes';

export type { ScrollGutterMode };

export type DialogScrollViewportProps = {
  class?: string;
  frameClass?: string;
  /** 单层滚动（外框留白 + 内轨合并），适用于挂 externalScrollElement 的虚拟列表 */
  compact?: boolean;
  /** 弹窗内嵌套小列表（圆角边框面板） */
  nested?: boolean;
  /**
   * 滚动条预留：both 两侧 / single 单侧 / auto 自动（默认）。
   */
  scrollGutter?: ScrollGutterMode;
  trackRef?: (el: HTMLDivElement) => void;
  children: JSX.Element;
};

export function DialogScrollViewport(props: DialogScrollViewportProps) {
  const [local] = splitProps(props, [
    'class',
    'frameClass',
    'compact',
    'nested',
    'scrollGutter',
    'trackRef',
    'children',
  ]);
  const frameClass = () =>
    local.frameClass ??
    (local.nested ? dialogNestedScrollFrame : dialogScrollFrameFlex);
  const trackClass = () =>
    cn(
      local.nested ? dialogNestedScrollTrack : dialogScrollTrack,
      scrollGutterClass(local.scrollGutter),
    );

  if (local.compact) {
    return (
      <div
        ref={local.trackRef}
        class={cn(frameClass(), trackClass(), 'min-h-0 flex-1', local.class)}
      >
        {local.children}
      </div>
    );
  }

  return (
    <div class={frameClass()}>
      <div ref={local.trackRef} class={cn(trackClass(), local.class)}>
        {local.children}
      </div>
    </div>
  );
}
