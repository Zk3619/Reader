/**
 * 下载模块主页 —— 任务列表
 */

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
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
import {
  getDownloadService,
  type DownloadTask,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';

type TaskFilter = 'all' | 'active' | 'done';

const FILTER_OPTIONS = ['all', 'active', 'done'] as const satisfies readonly TaskFilter[];
const FILTER_LABELS: Record<TaskFilter, string> = {
  all: '全部',
  active: '进行中',
  done: '已完成',
};

export function DownloadPage() {
  const service = getDownloadService();
  const [tasks, setTasks] = createSignal<DownloadTask[]>(service.list());
  const [filter, setFilter] = createSignal<TaskFilter>('all');

  const refresh = () => setTasks(service.list());

  onMount(() => {
    refresh();
    const unsub = service.queue.on((event) => {
      refresh();
      if (event.type !== 'task-updated') return;
      const { task, prev } = event;
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
    });
    onCleanup(() => unsub());
  });

  const visible = () => {
    const list = tasks();
    if (filter() === 'active') {
      return list.filter((t) =>
        ['ready', 'waiting', 'running', 'paused', 'error'].includes(t.state),
      );
    }
    if (filter() === 'done') return list.filter((t) => t.state === 'done');
    return list;
  };

  const pauseOrResume = async (task: DownloadTask) => {
    try {
      if (task.state === 'paused' || task.state === 'error') await service.resume(task.id);
      else await service.pause(task.id);
      refresh();
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const remove = async (task: DownloadTask) => {
    try {
      await service.delete(task.id, { deleteFiles: false });
      refresh();
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
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
            onClick={() => refresh()}
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
          when={visible().length > 0}
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
            <For each={visible()}>
              {(task) => (
                <li class="rounded-2xl border border-border/50 bg-card p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="min-w-0 truncate text-sm font-semibold">{task.title}</h3>
                        <Badge variant={DOWNLOAD_TASK_STATE_BADGE[task.state]} class="shrink-0">
                          {DOWNLOAD_TASK_STATE_LABEL[task.state]}
                        </Badge>
                        <Badge variant="outline" class="shrink-0 font-normal">
                          {DOWNLOAD_ENGINE_LABEL[task.engine]}
                        </Badge>
                      </div>
                      <p class="truncate text-xs text-muted-foreground">{task.url}</p>
                      <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          {formatDownloadBytes(task.downloaded)}
                          {task.total > 0 ? ` / ${formatDownloadBytes(task.total)}` : ''}
                        </span>
                        <Show when={formatDownloadSpeed(task.speed)}>
                          {(s) => <span>{s()}</span>}
                        </Show>
                        <Show when={formatDownloadEta(task.eta)}>
                          {(eta) => <span>剩余 {eta()}</span>}
                        </Show>
                        <span>{Math.min(100, Math.max(0, Math.round(task.percent)))}%</span>
                      </div>
                      <Progress value={Math.min(100, Math.max(0, task.percent))} class="w-full" />
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        onClick={() => void pauseOrResume(task)}
                        aria-label={
                          task.state === 'paused' || task.state === 'error' ? '继续' : '暂停'
                        }
                      >
                        <Show
                          when={task.state === 'paused' || task.state === 'error'}
                          fallback={<Pause class="size-4" />}
                        >
                          <PlayIcon class="size-4" />
                        </Show>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        onClick={() => void remove(task)}
                        aria-label="删除"
                      >
                        <TrashIcon class="size-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </DownloadHubPageShell>
  );
}
