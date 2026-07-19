/**
 * 目录项：未缓存章节在右侧显示云图标（已缓存则不显示）
 */

import { Show } from 'solid-js';
import { ChapterUncachedIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface ChapterCacheCloudIconProps {
  /** 该章是否已写入章节缓存 */
  cached: boolean;
  /** 卷标题等不参与缓存提示 */
  isVolume?: boolean;
  /** 在线书等为 true；本地书应传 false，避免空缓存集被当成「全部未缓存」 */
  enabled?: boolean;
  class?: string;
}

export function ChapterCacheCloudIcon(props: ChapterCacheCloudIconProps) {
  const show = () =>
    props.enabled !== false && !props.isVolume && !props.cached;

  return (
    <Show when={show()}>
      <span
        class={cn('inline-flex shrink-0', props.class)}
        role="img"
        aria-label="未缓存"
      >
        <ChapterUncachedIcon
          class="text-muted-foreground/70"
          size={14}
        />
      </span>
    </Show>
  );
}
