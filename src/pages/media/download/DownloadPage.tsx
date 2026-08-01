/**
 * 下载模块主页 —— 任务列表
 */

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { Pause } from 'lucide-solid';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import {
  DOWNLOAD_ENGINE_LABEL,
  DOWNLOAD_TASK_STATE_BADGE,
  DOWNLOAD_TASK_STATE_LABEL,
  formatDownloadBytes,
  formatDownloadEta,
  formatDownloadSpeed,
} from '@/pages/media/download/download-ui';
import { DeleteDownloadHubTaskDialog } from '@/components/media/download/DeleteDownloadHubTaskDialog';
import { AppTabs } from '@/components/shared/AppTabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DownloadIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { setDownloadSection } from '@/stores/download-hub/section';
import { settingsStore } from '@/stores/settings';
import {
  getDownloadService,
  type DownloadTask,
  type DownloadTaskState,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import { isTauri } from '@/lib/platform/detect';

type TaskFilter = 'all' | 'active' | 'done';

const FILTER_OPTIONS = ['all', 'active', 'done'] as const satisfies readonly TaskFilter[];
const FILTER_LABELS: Record<TaskFilter, string> = {
  all: '全部',
  active: '进行中',
  done: '已完成',
};

const ACTIVE_STATES: DownloadTaskState[] = [
  'ready',
  'waiting',
  'running',
  'paused',
  'error',
];

const FIELD_KEYS = [
  'state',
  'percent',
  'speed',
  'eta',
  'downloaded',
  'total',
  'filepath',
  'error',
  'title',
  'engine',
  'url',
  'fileMissing',
] as const satisfies readonly (keyof DownloadTask)[];

function matchesFilter(task: DownloadTask, filter: TaskFilter): boolean {
  if (filter === 'active') return ACTIVE_STATES.includes(task.state);
  if (filter === 'done') return task.state === 'done';
  return true;
}

function DownloadTaskRow(props: {
  task: DownloadTask;
  onPauseResume: (task: DownloadTask) => void;
  onRemove: (task: DownloadTask) => void;
}) {
  const percent = () => Math.min(100, Math.max(0, props.task.percent));
  const canToggle = () => props.task.state !== 'done';
  const missing = () => Boolean(props.task.fileMissing);

  return (
    <li
      class={cn(
        'rounded-2xl border border-border/50 bg-card p-4 transition-opacity',
        missing() && 'opacity-55',
      )}
    >
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div class={cn('min-w-0 flex-1 space-y-2', missing() && 'text-muted-foreground')}>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="min-w-0 truncate text-sm font-semibold">{props.task.title}</h3>
              <Badge variant={DOWNLOAD_TASK_STATE_BADGE[props.task.state]} class="shrink-0">
                {DOWNLOAD_TASK_STATE_LABEL[props.task.state]}
              </Badge>
              <Badge variant="outline" class="shrink-0 font-normal">
                {DOWNLOAD_ENGINE_LABEL[props.task.engine]}
              </Badge>
              <Show when={missing()}>
                <Badge variant="secondary" class="shrink-0 font-normal">
                  文件已丢失
                </Badge>
              </Show>
            </div>
            <p class="truncate text-xs text-muted-foreground">{props.task.url}</p>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                {formatDownloadBytes(props.task.downloaded)}
                {props.task.total > 0 ? ` / ${formatDownloadBytes(props.task.total)}` : ''}
              </span>
              <Show when={formatDownloadSpeed(props.task.speed)}>
                {(s) => <span>{s()}</span>}
              </Show>
              <Show when={formatDownloadEta(props.task.eta)}>
                {(eta) => <span>剩余 {eta()}</span>}
              </Show>
              <span>{Math.round(percent())}%</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Show when={canToggle()}>
              <Button
                size="icon"
                variant="ghost"
                class="size-8"
                onClick={() => props.onPauseResume(props.task)}
                aria-label={
                  props.task.state === 'paused' || props.task.state === 'error' ? '继续' : '暂停'
                }
              >
                <Show
                  when={props.task.state === 'paused' || props.task.state === 'error'}
                  fallback={<Pause class="size-4" />}
                >
                  <PlayIcon class="size-4" />
                </Show>
              </Button>
            </Show>
            <Button
              size="icon"
              variant="ghost"
              class="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => props.onRemove(props.task)}
              aria-label="删除"
            >
              <TrashIcon class="size-4" />
            </Button>
          </div>
        </div>
        <Progress value={percent()} class="w-full" />
      </div>
    </li>
  );
}

export function DownloadPage() {
  const service = getDownloadService();
  const [taskStore, setTaskStore] = createStore<{ list: DownloadTask[] }>({
    list: service.list(),
  });
  const [filter, setFilter] = createSignal<TaskFilter>('all');
  const [pendingDelete, setPendingDelete] = createSignal<DownloadTask | null>(null);
  const [deleteOpen, setDeleteOpen] = createSignal(false);

  const refresh = () => setTaskStore('list', reconcile(service.list()));

  const patchTaskFields = (id: string, prev: DownloadTask, next: DownloadTask) => {
    const idx = taskStore.list.findIndex((t) => t.id === id);
    if (idx < 0) {
      setTaskStore('list', taskStore.list.length, next);
      return;
    }
    for (const key of FIELD_KEYS) {
      if (prev[key] !== next[key]) {
        setTaskStore('list', idx, key, next[key] as never);
      }
    }
    if (JSON.stringify(prev.meta) !== JSON.stringify(next.meta)) {
      setTaskStore('list', idx, 'meta', next.meta);
    }
    if (prev.updatedAt !== next.updatedAt) {
      setTaskStore('list', idx, 'updatedAt', next.updatedAt);
    }
  };

  onMount(() => {
    void (async () => {
      await service.queue.ensureHydrated();
      refresh();
      await service.queue.refreshFileMissingFlags();
      refresh();
    })();

    const unsub = service.queue.on((event) => {
      if (event.type === 'task-added') {
        setTaskStore(
          'list',
          produce((list) => {
            const idx = list.findIndex((t) => t.id === event.task.id);
            if (idx >= 0) list[idx] = event.task;
            else list.push(event.task);
          }),
        );
        return;
      }
      if (event.type === 'task-removed') {
        setTaskStore(
          'list',
          produce((list) => {
            const idx = list.findIndex((t) => t.id === event.id);
            if (idx >= 0) list.splice(idx, 1);
          }),
        );
        return;
      }
      if (event.type === 'task-updated') {
        const { task, prev } = event;
        patchTaskFields(task.id, prev, task);
        if (
          task.state === 'error' &&
          task.error &&
          (prev.state !== 'error' || prev.error !== task.error)
        ) {
          showAppToast({
            title: '下载失败',
            description: `${task.title}：${task.error}`,
            variant: 'error',
          });
        }
        return;
      }
      if (event.type === 'list-changed') {
        const ids = new Set(event.tasks.map((t) => t.id));
        const localIds = taskStore.list.map((t) => t.id);
        const structural =
          ids.size !== localIds.length || localIds.some((id) => !ids.has(id));
        if (structural) refresh();
      }
    });

    const onFocus = () => {
      void service.queue.refreshFileMissingFlags();
    };
    window.addEventListener('focus', onFocus);
    onCleanup(() => {
      unsub();
      window.removeEventListener('focus', onFocus);
    });
  });

  const visibleCount = () =>
    taskStore.list.reduce(
      (n, t) => n + (matchesFilter(t, filter()) ? 1 : 0),
      0,
    );

  const pauseOrResume = async (task: DownloadTask) => {
    try {
      if (task.state === 'paused' || task.state === 'error') await service.resume(task.id);
      else await service.pause(task.id);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const canOfferDeleteFile = (task: DownloadTask) =>
    isTauri() &&
    !task.fileMissing &&
    Boolean(task.filepath?.trim()) &&
    !task.filepath.endsWith('.part');

  const performDelete = async (task: DownloadTask, deleteFiles: boolean) => {
    try {
      await service.delete(task.id, {
        deleteFiles: task.fileMissing ? false : deleteFiles,
      });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const requestDelete = async (task: DownloadTask) => {
    const app = settingsStore.state.app;
    if (
      canOfferDeleteFile(task) &&
      app.rememberDeleteDownloadHubFileAction &&
      app.deleteDownloadHubFileAction !== undefined
    ) {
      await performDelete(task, app.deleteDownloadHubFileAction);
      return;
    }
    setPendingDelete(task);
    setDeleteOpen(true);
  };

  return (
    <DownloadHubPageShell
      section="tasks"
      toolbar={
        <>
          <Button
            size="icon"
            variant="ghost"
            class="h-9 w-9"
            onClick={() => {
              refresh();
              void service.queue.refreshFileMissingFlags().then(() => refresh());
            }}
            aria-label="刷新"
          >
            <RefreshIcon class="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            class="h-9 w-9"
            onClick={() => setDownloadSection('create')}
            aria-label="新建"
          >
            <PlusIcon class="size-4" />
          </Button>
        </>
      }
      below={
        <AppTabs
          value={filter()}
          onChange={setFilter}
          options={FILTER_OPTIONS}
          labels={FILTER_LABELS}
          ariaLabel="任务筛选"
          variant="drawer-inline"
          layout="inline"
        />
      }
    >
      <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
        <Show
          when={visibleCount() > 0}
          fallback={
            <div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div class="flex size-14 items-center justify-center rounded-2xl border border-border/50 bg-card text-muted-foreground">
                <DownloadIcon class="size-6" />
              </div>
              <div class="space-y-1">
                <p class="text-sm font-medium">暂无下载任务</p>
                <p class="text-xs text-muted-foreground">粘贴链接即可开始下载</p>
              </div>
              <Button size="sm" onClick={() => setDownloadSection('create')}>
                <PlusIcon class="size-4" />
                新建下载
              </Button>
            </div>
          }
        >
          <ul class="flex flex-col gap-3">
            <For each={taskStore.list}>
              {(task) => (
                <Show when={matchesFilter(task, filter())}>
                  <DownloadTaskRow
                    task={task}
                    onPauseResume={(t) => void pauseOrResume(t)}
                    onRemove={(t) => void requestDelete(t)}
                  />
                </Show>
              )}
            </For>
          </ul>
        </Show>
      </div>

      <DeleteDownloadHubTaskDialog
        open={deleteOpen()}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setPendingDelete(null);
        }}
        task={pendingDelete()}
        onConfirm={(deleteFile) => {
          const task = pendingDelete();
          if (!task) return;
          void performDelete(task, deleteFile);
        }}
      />
    </DownloadHubPageShell>
  );
}
