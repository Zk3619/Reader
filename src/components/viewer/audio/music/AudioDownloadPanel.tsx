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

const STATUS_LABELS = {
  pending: '等待中',
  downloading: '下载中',
  completed: '已完成',
  failed: '失败',
} as const;

export const AudioDownloadPanel: Component<AudioDownloadPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [tasks, { refetch }] = createResource(() =>
    active() ? listDownloadTasks() : Promise.resolve([]),
  );

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="下载任务"
      hideHeader={props.hideHeader}
      onClose={props.onClose}
      headerExtra={
        <Button size="sm" variant="outline" onClick={() => void processDownloadQueue().then(() => refetch())}>
          刷新任务
        </Button>
      }
    >
      <Show
        when={(tasks() ?? []).length > 0}
        fallback={<p class="p-4 text-sm text-muted-foreground">暂无下载任务。</p>}
      >
        <ul class="space-y-2 p-4">
          <For each={tasks() ?? []}>
            {(task) => (
              <li class="rounded border px-3 py-2 text-sm">
                <p class="font-medium">{task.trackName}</p>
                <p class="text-xs text-muted-foreground">
                  {STATUS_LABELS[task.status]} · {Math.round(task.progress * 100)}%
                </p>
                <Show when={task.error}>
                  <p class="mt-1 text-xs text-destructive">{task.error}</p>
                </Show>
                <Button
                  size="sm"
                  variant="ghost"
                  class="mt-1"
                  onClick={() => void deleteDownloadTask(task.id).then(() => refetch())}
                >
                  删除任务
                </Button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </AudioPanelShell>
  );
};
