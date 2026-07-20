/**
 * 播放队列编辑面板（兼容旧调用；新侧栏请用 MusicQueuePane）
 */

import { Show, type Component } from 'solid-js';
import { X } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { viewerStore } from '@/stores/viewer';
import { MusicQueuePane } from '@/components/media/viewer/audio/music/hub/MusicQueuePane';

export interface MusicQueuePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MusicQueuePanel: Component<MusicQueuePanelProps> = (props) => {
  const queue = () => viewerStore.state.trackQueue;

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-135 flex justify-end bg-black/40">
        <div class="flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
          <div class="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <span class="truncate font-medium">播放队列 ({queue().length})</span>
              <Show when={viewerStore.state.playerListName}>
                {(name) => (
                  <span class="max-w-36 shrink-0 truncate text-xs text-muted-foreground">
                    来自 {name()}
                  </span>
                )}
              </Show>
            </div>
            <Button variant="ghost" size="icon" onClick={() => props.onOpenChange(false)}>
              <X class="h-4 w-4" />
            </Button>
          </div>
          <MusicQueuePane />
        </div>
      </div>
    </Show>
  );
};
