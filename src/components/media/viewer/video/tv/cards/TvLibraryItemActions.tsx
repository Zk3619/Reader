/**
 * 影视收藏 / 历史行操作：收藏(可选) / 查看详情 / 立即播放 / 调整分组 / 删除
 */

import { Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  BookInfoIcon,
  FolderIcon,
  PlayIcon,
  StarIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface TvLibraryItemActionsProps {
  itemName: string;
  onDetail: () => void;
  onPlay: () => void;
  onGroup: () => void;
  onRemove: () => void;
  /** 传入时在「查看详情」左侧显示收藏切换 */
  kept?: boolean;
  onToggleKeep?: () => void;
  /** list：行尾 ghost；cover：封面底部叠层 */
  appearance?: 'list' | 'cover';
  class?: string;
}

function stopCardActivate(e: MouseEvent) {
  e.stopPropagation();
}

export const TvLibraryItemActions: Component<TvLibraryItemActionsProps> = (props) => {
  const isCover = () => (props.appearance ?? 'list') === 'cover';
  const name = () => props.itemName || '未命名';

  const btnClass = () =>
    isCover()
      ? 'h-7 w-7 shrink-0 text-white hover:bg-white/20 hover:text-white'
      : 'h-8 w-8 shrink-0';

  const iconClass = () => (isCover() ? 'h-3.5 w-3.5' : 'h-4 w-4');

  return (
    <div
      class={cn(
        'flex shrink-0 items-center',
        isCover() ? 'w-full justify-center gap-0' : 'gap-0.5',
        props.class,
      )}
      onClick={stopCardActivate}
      onMouseDown={stopCardActivate}
    >
      <Show when={props.onToggleKeep}>
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            type="button"
            variant="ghost"
            size="icon"
            class={btnClass()}
            aria-label={props.kept ? `取消收藏 ${name()}` : `收藏 ${name()}`}
            onClick={() => props.onToggleKeep?.()}
          >
            <StarIcon
              class={cn(
                iconClass(),
                props.kept
                  ? 'fill-amber-400 text-amber-400'
                  : isCover()
                    ? 'text-white'
                    : 'text-muted-foreground',
              )}
            />
          </AppTooltipTrigger>
          <AppTooltipContent>{props.kept ? '取消收藏' : '收藏'}</AppTooltipContent>
        </AppTooltip>
      </Show>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          type="button"
          variant="ghost"
          size="icon"
          class={btnClass()}
          aria-label={`查看详情 ${name()}`}
          onClick={() => props.onDetail()}
        >
          <BookInfoIcon class={iconClass()} />
        </AppTooltipTrigger>
        <AppTooltipContent>查看详情</AppTooltipContent>
      </AppTooltip>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          type="button"
          variant="ghost"
          size="icon"
          class={btnClass()}
          aria-label={`立即播放 ${name()}`}
          onClick={() => props.onPlay()}
        >
          <PlayIcon class={iconClass()} />
        </AppTooltipTrigger>
        <AppTooltipContent>立即播放</AppTooltipContent>
      </AppTooltip>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          type="button"
          variant="ghost"
          size="icon"
          class={btnClass()}
          aria-label={`调整分组 ${name()}`}
          onClick={() => props.onGroup()}
        >
          <FolderIcon class={iconClass()} />
        </AppTooltipTrigger>
        <AppTooltipContent>调整分组</AppTooltipContent>
      </AppTooltip>
      <AppTooltip>
        <AppTooltipTrigger
          as={Button}
          type="button"
          variant="ghost"
          size="icon"
          class={cn(btnClass(), !isCover() && 'text-destructive hover:text-destructive')}
          aria-label={`删除 ${name()}`}
          onClick={() => props.onRemove()}
        >
          <TrashIcon class={iconClass()} />
        </AppTooltipTrigger>
        <AppTooltipContent>删除</AppTooltipContent>
      </AppTooltip>
    </div>
  );
};
