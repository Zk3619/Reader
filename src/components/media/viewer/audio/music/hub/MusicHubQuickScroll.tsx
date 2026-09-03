/**
 * 音乐 Hub 长列表快速滚动（到顶/到底），对齐书架 QuickScrollButtons。
 * 固定抬高到底栏 PlayBar 之上，避免被播放条遮挡。
 * 音乐 Hub 上全局播放条已隐藏，GMP inset 为 0，不会与这里的 bottom-20 叠两次。
 */

import type { Accessor, Component } from 'solid-js';
import { QuickScrollButtons } from '@/components/shell/QuickScrollButtons';
import { cn } from '@/lib/utils';

export interface MusicHubQuickScrollProps {
  container: Accessor<HTMLElement | undefined>;
  contentRevision?: Accessor<unknown>;
  class?: string;
}

export const MusicHubQuickScroll: Component<MusicHubQuickScrollProps> = (props) => {
  return (
    <QuickScrollButtons
      container={props.container}
      contentRevision={props.contentRevision}
      class={cn('bottom-20 z-110', props.class)}
    />
  );
};
