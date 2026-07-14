/**
 * 播放队列编辑面板
 */

import { For, Show, type Component } from 'solid-js';
import { X, Trash2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { viewerStore } from '@/stores/viewer';
import { playPlaylist, removeFromQueue } from '@/stores/viewer/media/audio';

export interface MusicQueuePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MusicQueuePanel: Component<MusicQueuePanelProps> = (props) => {
  const queue = () => viewerStore.state.trackQueue;
  const currentIndex = () => viewerStore.state.trackIndex;

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex justify-end bg-black/40">
        <div class="flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <span class="font-medium">播放队列 ({queue().length})</span>
            <Button variant="ghost" size="icon" onClick={() => props.onOpenChange(false)}>
              <X class="h-4 w-4" />
            </Button>
          </div>
          <ul class="min-h-0 flex-1 overflow-y-auto">
            <For each={queue()}>
              {(track, i) => (
                <li
                  class={
                    i() === currentIndex()
                      ? 'bg-primary/10'
                      : 'hover:bg-muted/50'
                  }
                >
                  <div class="flex items-center gap-2 px-4 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      class="h-auto min-w-0 flex-1 justify-start text-left font-normal"
                      onClick={() =>
                        void playPlaylist(queue(), i(), {
                          origin: viewerStore.state.musicQueueOrigin,
                        })
                      }
                    >
                      <p class="truncate text-sm">{track.name}</p>
                      <p class="truncate text-xs text-muted-foreground">{track.artist}</p>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="shrink-0"
                      onClick={() => void removeFromQueue(i())}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>
    </Show>
  );
};
