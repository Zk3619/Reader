/**
 * 播放队列内容面板（无外壳，供详情页侧栏 / Drawer 复用）
 */

import { For, Show, createEffect, type Component } from 'solid-js';
import { ListMusic, Trash2, Volume2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { viewerStore } from '@/stores/viewer';
import { applyMusicTrack, removeFromQueue } from '@/stores/viewer/media/audio';
import { trackAlbumName } from '@/lib/media/audio/music-search-result-ui';
import { cn } from '@/lib/utils';

export interface MusicQueuePaneProps {
  class?: string;
}

export const MusicQueuePane: Component<MusicQueuePaneProps> = (props) => {
  const queue = () => viewerStore.state.trackQueue;
  const currentIndex = () => viewerStore.state.trackIndex;
  const sourceLabel = () => viewerStore.state.playerListName;
  let listEl: HTMLUListElement | undefined;

  createEffect(() => {
    const index = currentIndex();
    const el = listEl?.querySelector<HTMLElement>(`[data-queue-index="${index}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  return (
    <div class={cn('flex min-h-0 flex-1 flex-col', props.class)}>
      <Show when={sourceLabel()}>
        <div class="shrink-0 border-b border-border/60 px-2 py-2 text-xs text-muted-foreground">
          来自：<span class="text-foreground">{sourceLabel()}</span>
        </div>
      </Show>
      <ul
        ref={(el) => {
          listEl = el;
        }}
        class="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto pr-1"
      >
        <For
          each={queue()}
          fallback={
            <li class="flex h-36 flex-col items-center justify-center gap-2 text-muted-foreground">
              <ListMusic class="h-9 w-9 opacity-40" />
              <p class="text-sm">播放队列为空</p>
            </li>
          }
        >
          {(track, i) => (
            <li
              data-queue-index={i()}
              aria-current={i() === currentIndex() ? 'true' : undefined}
              class={cn(
                'group rounded-md transition-colors',
                i() === currentIndex() ? 'bg-primary/10' : 'hover:bg-muted/50',
              )}
            >
              <div class="flex items-center gap-2 px-2 py-1.5">
                <div class="flex h-8 w-6 shrink-0 items-center justify-center text-xs tabular-nums text-muted-foreground">
                  <Show when={i() === currentIndex()} fallback={i() + 1}>
                    <Volume2 class="h-4 w-4 text-primary" />
                  </Show>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  class="h-auto min-w-0 flex-1 justify-start rounded-md px-2 py-1.5 text-left font-normal"
                  onClick={() => void applyMusicTrack(i())}
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class={cn(
                        'block truncate text-sm',
                        i() === currentIndex() && 'font-medium text-primary',
                      )}
                    >
                      {track.name}
                    </span>
                    <span class="block truncate text-xs text-muted-foreground">
                      {[track.artist, trackAlbumName(track)].filter(Boolean).join(' · ') ||
                        '未知艺术家'}
                    </span>
                  </span>
                  <span class="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {track.duration}
                  </span>
                </Button>
                <AppTooltip>
                  <AppTooltipTrigger as="div">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 shrink-0 opacity-60 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`从队列移除 ${track.name}`}
                      onClick={() => void removeFromQueue(i())}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </AppTooltipTrigger>
                  <AppTooltipContent layer="viewer">从队列移除</AppTooltipContent>
                </AppTooltip>
              </div>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
};
