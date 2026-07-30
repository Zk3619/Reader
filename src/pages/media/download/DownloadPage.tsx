/**
 * 下载模块主页 —— 任务列表
 */

import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Pause } from 'lucide-solid';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import {
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  Settings2Icon,
  TrashIcon,
} from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageHost,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setDownloadSection } from '@/stores/download-hub/section';
import {
  getDownloadService,
  type DownloadTask,
} from '@/lib/download';
import { showAppToast } from '@/components/shared/AppToasts';

function formatBytes(n: number): string {
  if (!n || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(n: number): string {
  if (!n || n <= 0) return '';
  return `${formatBytes(n)}/s`;
}

export function DownloadPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const service = getDownloadService();
  const [tasks, setTasks] = createSignal<DownloadTask[]>(service.list());
  const [filter, setFilter] = createSignal<'all' | 'active' | 'done'>('all');

  const refresh = () => setTasks(service.list());

  onMount(() => {
    refresh();
    const unsub = service.queue.on(() => refresh());
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
    <div class={cn(mainShellPageHost, tabEnterClass(), 'flex min-h-0 flex-1 flex-col')}>
      <PageToolbar class={pageToolbarBottomBorder} title="下载">
        <div class="flex items-center gap-1">
          <div class="mr-2 flex items-center gap-1 text-xs text-muted-foreground">
            <button
              type="button"
              class={cn('rounded px-2 py-0.5', filter() === 'all' && 'bg-accent text-accent-foreground')}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              type="button"
              class={cn('rounded px-2 py-0.5', filter() === 'active' && 'bg-accent text-accent-foreground')}
              onClick={() => setFilter('active')}
            >
              进行中
            </button>
            <button
              type="button"
              class={cn('rounded px-2 py-0.5', filter() === 'done' && 'bg-accent text-accent-foreground')}
              onClick={() => setFilter('done')}
            >
              已完成
            </button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => refresh()} aria-label="刷新">
            <RefreshIcon class="size-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDownloadSection('create')}>
            <PlusIcon class="size-4" />
            新建
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDownloadSection('settings')}>
            <Settings2Icon class="size-4" />
          </Button>
        </div>
      </PageToolbar>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <Show
          when={visible().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
              <p>暂无下载任务</p>
              <Button size="sm" onClick={() => setDownloadSection('create')}>
                粘贴链接开始下载
              </Button>
            </div>
          }
        >
          <ul class="flex flex-col gap-2">
            <For each={visible()}>
              {(task) => (
                <li class="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-medium">{task.title}</div>
                      <div class="mt-0.5 truncate text-xs text-muted-foreground">{task.url}</div>
                      <div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{task.state}</span>
                        <span>{task.engine}</span>
                        <span>
                          {formatBytes(task.downloaded)}
                          {task.total > 0 ? ` / ${formatBytes(task.total)}` : ''}
                        </span>
                        <Show when={formatSpeed(task.speed)}>
                          {(s) => <span>{s()}</span>}
                        </Show>
                      </div>
                      <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          class="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${Math.min(100, Math.max(0, task.percent))}%` }}
                        />
                      </div>
                      <Show when={task.error}>
                        <p class="mt-1 text-xs text-destructive">{task.error}</p>
                      </Show>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        onClick={() => void pauseOrResume(task)}
                        aria-label={task.state === 'paused' ? '继续' : '暂停'}
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
    </div>
  );
}
