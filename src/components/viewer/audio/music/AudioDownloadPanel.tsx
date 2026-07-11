/** 下载队列 UI */
import { createResource, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  deleteDownloadTask,
  listDownloadTasks,
  processDownloadQueue,
} from '@/lib/media/audio/audio-download';
import { AudioPanelShell } from '@/components/viewer/audio/music/AudioPanelShell';

export interface AudioDownloadPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
  hideHeader?: boolean;
}

export const AudioDownloadPanel: Component<AudioDownloadPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [tasks, { refetch }] = createResource(() =>
    active() ? listDownloadTasks() : Promise.resolve([]),
  );

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="下载队列"
      hideHeader={props.hideHeader}
      onClose={props.onClose}
      headerExtra={
        <Button size="sm" variant="outline" onClick={() => void processDownloadQueue().then(() => refetch())}>
          刷新
        </Button>
      }
    >
      <ul class="p-4">
        <For each={tasks() ?? []}>
          {(task) => (
            <li class="mb-2 rounded border px-3 py-2 text-sm">
              <p class="font-medium">{task.trackName}</p>
              <p class="text-xs text-muted-foreground">
                {task.status} · {Math.round(task.progress * 100)}%
              </p>
              <Show when={task.error}>
                <p class="text-xs text-destructive">{task.error}</p>
              </Show>
              <Button
                size="sm"
                variant="ghost"
                class="mt-1"
                onClick={() => void deleteDownloadTask(task.id).then(() => refetch())}
              >
                删除
              </Button>
            </li>
          )}
        </For>
      </ul>
    </AudioPanelShell>
  );
};
