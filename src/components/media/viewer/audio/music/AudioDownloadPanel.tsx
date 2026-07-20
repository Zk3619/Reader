/** 下载队列 UI — 五态 Tab + 暂停/续传/打开文件夹/本地优先播放 */
import { createMemo, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  type AudioDownloadTask,
  type DownloadTaskStatus,
  deleteDownloadTask,
  listDownloadTasks,
  openDownloadTaskFolder,
  pauseDownloadTask,
  processDownloadQueue,
  resumeDownloadTask,
  retryDownloadTask,
} from '@/lib/media/audio/audio-download';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { AudioPanelShell } from '@/components/media/viewer/audio/music/AudioPanelShell';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/platform/detect';

export interface AudioDownloadPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
  hideHeader?: boolean;
}

type TabId = 'all' | 'run' | 'pause' | 'error' | 'completed';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'run', label: '下载中' },
  { id: 'pause', label: '已暂停' },
  { id: 'error', label: '出错' },
  { id: 'completed', label: '已完成' },
];

const STATUS_LABELS: Record<DownloadTaskStatus, string> = {
  waiting: '等待中',
  run: '下载中',
  pause: '已暂停',
  error: '出错',
  completed: '已完成',
};

function matchesTab(task: AudioDownloadTask, tab: TabId): boolean {
  if (tab === 'all') return true;
  if (tab === 'run') return task.status === 'run' || task.status === 'waiting';
  return task.status === tab;
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function playDownloadTask(task: AudioDownloadTask): Promise<void> {
  const { getAudioTrack } = await import('@/lib/database/audio-library');
  const track = await getAudioTrack(task.trackId);
  if (!track) throw new Error('曲目不存在');
  const withPath = {
    ...track,
    meta: {
      ...track.meta,
      filePath: task.localPath && !task.localPath.endsWith('.part') ? task.localPath : track.meta.filePath,
    },
  };
  const { setMusicTrackQueue } = await import('@/stores/viewer/media/audio');
  setMusicTrackQueue([withPath], 0, withPath.source, {
    origin: 'download',
    listName: '下载列表',
    listKind: 'temporary',
  });
}

export const AudioDownloadPanel: Component<AudioDownloadPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [tab, setTab] = createSignal<TabId>('all');
  const [tasks, { refetch }] = createResource(() =>
    active() ? listDownloadTasks() : Promise.resolve([]),
  );

  const filtered = createMemo(() => (tasks() ?? []).filter((t) => matchesTab(t, tab())));

  const refresh = () => void processDownloadQueue().then(() => refetch());

  return (
    <AudioPanelShell
      open={props.open}
      inline={props.inline}
      title="下载任务"
      hideHeader={props.hideHeader}
      onClose={props.onClose}
      headerExtra={
        <Button size="sm" variant="outline" onClick={refresh}>
          刷新
        </Button>
      }
    >
      <div class="flex flex-wrap gap-1 border-b px-3 py-2">
        <For each={TABS}>
          {(item) => (
            <Button
              size="sm"
              variant={tab() === item.id ? 'secondary' : 'ghost'}
              class={cn('h-8', tab() === item.id && 'font-medium')}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </Button>
          )}
        </For>
      </div>

      <Show
        when={filtered().length > 0}
        fallback={<p class="p-4 text-sm text-muted-foreground">暂无下载任务。</p>}
      >
        <ul class="space-y-2 overflow-y-auto p-4">
          <For each={filtered()}>
            {(task) => (
              <li class="rounded border px-3 py-2 text-sm">
                <p class="font-medium">{task.trackName || task.fileName || task.trackId}</p>
                <p class="text-xs text-muted-foreground">
                  {task.statusText || STATUS_LABELS[task.status]}
                  {task.progressTotal > 0
                    ? ` · ${formatBytes(task.progressDownloaded)} / ${formatBytes(task.progressTotal)}`
                    : ` · ${Math.round(task.progress * 100)}%`}
                </p>
                <Show when={task.error}>
                  <p class="mt-1 text-xs text-destructive">
                    {toUserFacingMusicError(task.error, '下载失败，请稍后再试')}
                  </p>
                </Show>
                <div class="mt-2 flex flex-wrap gap-1">
                  <Show when={task.status === 'run' || task.status === 'waiting'}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void pauseDownloadTask(task.id).then(() => refetch())}
                    >
                      暂停
                    </Button>
                  </Show>
                  <Show when={task.status === 'pause'}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void resumeDownloadTask(task.id).then(() => refetch())}
                    >
                      继续
                    </Button>
                  </Show>
                  <Show when={task.status === 'error'}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void retryDownloadTask(task.id).then(() => refetch())}
                    >
                      重试
                    </Button>
                  </Show>
                  <Show when={task.status === 'completed'}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void playDownloadTask(task).catch((err) =>
                          console.warn('[download] play failed', err),
                        )
                      }
                    >
                      播放
                    </Button>
                  </Show>
                  <Show when={isTauri() && (task.localPath || true)}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void openDownloadTaskFolder(task).catch((err) =>
                          console.warn('[download] open folder failed', err),
                        )
                      }
                    >
                      打开文件夹
                    </Button>
                  </Show>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteDownloadTask(task.id).then(() => refetch())}
                  >
                    移除
                  </Button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </AudioPanelShell>
  );
};
