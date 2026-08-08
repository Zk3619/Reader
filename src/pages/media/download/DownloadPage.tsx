/**
 * 下载模块主页 —— 任务列表（多选 + 底部批量操作 + 清空）
 */

import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { Combine, Pause } from 'lucide-solid';
import { DownloadHubPageShell } from '@/pages/media/download/DownloadHubPageShell';
import {
  DOWNLOAD_ENGINE_LABEL,
  DOWNLOAD_TASK_STATE_BADGE,
  DOWNLOAD_TASK_STATE_LABEL,
  formatDownloadBytes,
  formatDownloadEta,
  formatDownloadSpeed,
} from '@/pages/media/download/download-ui';
import {
  DeleteDownloadHubTaskDialog,
  taskCanDeleteLocalFile,
  type DeleteDownloadHubMode,
} from '@/components/media/download/DeleteDownloadHubTaskDialog';
import {
  AppSelect,
  AppSelectContent,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import {
  AppDropdownMenu,
  AppDropdownMenuButtonTrigger,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import {
  ChevronDownIcon,
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
import { downloadHubContentInsetClass } from '@/lib/download/download-hub-section-meta';
import { showAppToast } from '@/components/shared/AppToasts';
import { formatDownloadErrorForUser, logDownloadError } from '@/lib/download/error-message';
import { cn } from '@/lib/utils';
import { mainShellPageScroll } from '@/lib/ui/viewport-classes';

type TaskFilter = 'all' | 'active' | 'paused' | 'error' | 'done';

const FILTER_OPTIONS = [
  'all',
  'active',
  'paused',
  'error',
  'done',
] as const satisfies readonly TaskFilter[];
const FILTER_LABELS: Record<TaskFilter, string> = {
  all: '全部',
  active: '进行中',
  paused: '已暂停',
  error: '出错',
  done: '已完成',
};

const BATCH_MENU_TRIGGER_CLASS = 'gap-1.5 group/trigger';
const BATCH_MENU_CHEVRON_CLASS =
  'size-3.5 opacity-60 transition-transform group-data-[expanded]/trigger:rotate-180';

/** 「进行中」：排队 / 下载中（不含已暂停、出错） */
const ACTIVE_STATES: DownloadTaskState[] = ['ready', 'waiting', 'running'];

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
  if (filter === 'paused') return task.state === 'paused';
  if (filter === 'error') return task.state === 'error';
  if (filter === 'done') return task.state === 'done' || task.state === 'needs_postprocess';
  return true;
}

function canPauseTask(task: DownloadTask): boolean {
  return task.state === 'running' || task.state === 'waiting';
}

function canResumeTask(task: DownloadTask): boolean {
  return task.state === 'paused' || task.state === 'ready';
}

function canRetryTask(task: DownloadTask): boolean {
  return task.state === 'error';
}

function canMergeTask(task: DownloadTask): boolean {
  return task.state === 'needs_postprocess';
}

function DownloadTaskRow(props: {
  task: DownloadTask;
  selected: boolean;
  onToggleSelection: () => void;
  onSelectionChange: (checked: boolean) => void;
  onPause: (task: DownloadTask) => void;
  onResume: (task: DownloadTask) => void;
  onRetry: (task: DownloadTask) => void;
  onMerge: (task: DownloadTask) => void;
  onRemove: (task: DownloadTask) => void;
}) {
  const percent = () => Math.min(100, Math.max(0, props.task.percent));
  const missing = () =>
    Boolean(props.task.fileMissing) &&
    props.task.state !== 'needs_postprocess' &&
    props.task.state !== 'error' &&
    props.task.state !== 'waiting' &&
    props.task.state !== 'running';
  const showPause = () => canPauseTask(props.task);
  const showResume = () => canResumeTask(props.task);
  const showRetry = () => canRetryTask(props.task);
  const showMerge = () => canMergeTask(props.task);

  return (
    <li
      class={cn(
        'rounded-2xl border border-border/50 bg-card p-4 transition-opacity',
        missing() && 'opacity-55',
        props.selected && 'border-primary/40 bg-accent/20',
      )}
    >
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div
            class={cn(
              'min-w-0 flex-1 cursor-pointer space-y-2',
              missing() && 'text-muted-foreground',
            )}
            onClick={() => props.onToggleSelection()}
            role="button"
            tabIndex={0}
          >
            <div class="flex flex-wrap items-center gap-2">
              <div
                class="flex shrink-0 items-center"
                onClick={(e) => e.stopPropagation()}
                role="presentation"
              >
                <Checkbox
                  checked={props.selected}
                  onChange={(checked) => props.onSelectionChange(checked)}
                  aria-label={`选择 ${props.task.title}`}
                />
              </div>
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
            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <Show when={formatDownloadSpeed(props.task.speed)}>
                {(s) => <span>{s()}</span>}
              </Show>
              <Show when={formatDownloadEta(props.task.eta)}>
                {(eta) => <span>剩余 {eta()}</span>}
              </Show>
              <span class="tabular-nums">
                {formatDownloadBytes(props.task.downloaded)}
                {' / '}
                {props.task.total > 0
                  ? formatDownloadBytes(props.task.total)
                  : '—'}
              </span>
              <span class="tabular-nums">{Math.round(percent())}%</span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Show when={showMerge()}>
              <AppTooltip>
                <AppTooltipTrigger
                  as={Button}
                  size="icon"
                  variant="ghost"
                  class="size-8"
                  onClick={() => props.onMerge(props.task)}
                  aria-label="合并"
                >
                  <Combine class="size-4" />
                </AppTooltipTrigger>
                <AppTooltipContent>合并分轨</AppTooltipContent>
              </AppTooltip>
            </Show>
            <Show when={showRetry()}>
              <AppTooltip>
                <AppTooltipTrigger
                  as={Button}
                  size="icon"
                  variant="ghost"
                  class="size-8"
                  onClick={() => props.onRetry(props.task)}
                  aria-label="重试"
                >
                  <RefreshIcon class="size-4" />
                </AppTooltipTrigger>
                <AppTooltipContent>重试下载</AppTooltipContent>
              </AppTooltip>
            </Show>
            <Show when={showResume()}>
              <AppTooltip>
                <AppTooltipTrigger
                  as={Button}
                  size="icon"
                  variant="ghost"
                  class="size-8"
                  onClick={() => props.onResume(props.task)}
                  aria-label="继续"
                >
                  <PlayIcon class="size-4" />
                </AppTooltipTrigger>
                <AppTooltipContent>继续下载</AppTooltipContent>
              </AppTooltip>
            </Show>
            <Show when={showPause()}>
              <AppTooltip>
                <AppTooltipTrigger
                  as={Button}
                  size="icon"
                  variant="ghost"
                  class="size-8"
                  onClick={() => props.onPause(props.task)}
                  aria-label="暂停"
                >
                  <Pause class="size-4" />
                </AppTooltipTrigger>
                <AppTooltipContent>暂停下载</AppTooltipContent>
              </AppTooltip>
            </Show>
            <AppTooltip>
              <AppTooltipTrigger
                as={Button}
                size="icon"
                variant="ghost"
                class="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => props.onRemove(props.task)}
                aria-label="删除"
              >
                <TrashIcon class="size-4" />
              </AppTooltipTrigger>
              <AppTooltipContent>删除任务</AppTooltipContent>
            </AppTooltip>
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
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = createSignal<DownloadTask | null>(null);
  const [deleteMode, setDeleteMode] = createSignal<DeleteDownloadHubMode>('single');
  const [deleteCount, setDeleteCount] = createSignal(0);
  const [deleteCanFile, setDeleteCanFile] = createSignal(false);
  const [deleteOpen, setDeleteOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const refresh = () => setTaskStore('list', reconcile(service.list()));

  const visibleTasks = createMemo(() =>
    taskStore.list.filter((t) => matchesFilter(t, filter())),
  );
  const visibleCount = () => visibleTasks().length;
  const selectedCount = () => selectedIds().size;
  const filteredSelectedCount = createMemo(() => {
    const selected = selectedIds();
    return visibleTasks().reduce((n, t) => n + (selected.has(t.id) ? 1 : 0), 0);
  });
  const allFilteredSelected = createMemo(() => {
    const list = visibleTasks();
    if (list.length === 0) return false;
    const selected = selectedIds();
    return list.every((t) => selected.has(t.id));
  });
  const isSelected = (id: string) => selectedIds().has(id);

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
    if (prev.meta !== next.meta) {
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
        setSelectedIds((prev) => {
          if (!prev.has(event.id)) return prev;
          const next = new Set(prev);
          next.delete(event.id);
          return next;
        });
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
            description: `${task.title}：${logDownloadError('task-updated', task.error, {
              id: task.id,
              url: task.url,
            })}`,
            variant: 'error',
          });
        } else if (
          task.state === 'needs_postprocess' &&
          prev.state !== 'needs_postprocess'
        ) {
          const reason =
            typeof task.meta.postprocessReason === 'string' && task.meta.postprocessReason.trim()
              ? formatDownloadErrorForUser(task.meta.postprocessReason)
              : '分轨已下载，请安装 ffmpeg 后点击合并';
          showAppToast({
            title: '待合并',
            description: `${task.title}：${reason}`,
            variant: 'warning',
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
        setSelectedIds((prev) => {
          let changed = false;
          const next = new Set<string>();
          for (const id of prev) {
            if (ids.has(id)) next.add(id);
            else changed = true;
          }
          return changed ? next : prev;
        });
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

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setSelectionChecked = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set<string>());

  const invertSelection = () => {
    const current = selectedIds();
    const next = new Set(current);
    for (const t of visibleTasks()) {
      if (current.has(t.id)) next.delete(t.id);
      else next.add(t.id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected()) {
      clearSelection();
      return;
    }
    setSelectedIds(new Set(visibleTasks().map((t) => t.id)));
  };

  const pauseTask = async (task: DownloadTask) => {
    if (!canPauseTask(task)) return;
    try {
      await service.pause(task.id);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const resumeTask = async (task: DownloadTask) => {
    if (!canResumeTask(task)) return;
    try {
      await service.resume(task.id);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const retryTask = async (task: DownloadTask) => {
    if (!canRetryTask(task)) return;
    try {
      await service.resume(task.id);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const mergeTask = async (task: DownloadTask) => {
    if (!canMergeTask(task)) return;
    try {
      await service.resume(task.id);
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  const selectedTasks = createMemo(() => {
    const ids = selectedIds();
    return taskStore.list.filter((t) => ids.has(t.id));
  });

  const selectionCaps = createMemo(() => {
    const tasks = selectedTasks();
    return {
      canPause: tasks.some(canPauseTask),
      canResume: tasks.some(canResumeTask),
      canRetry: tasks.some(canRetryTask),
      canMerge: tasks.some(canMergeTask),
      canDelete: tasks.length > 0,
    };
  });

  const openDeleteDialog = (opts: {
    mode: DeleteDownloadHubMode;
    task?: DownloadTask | null;
    tasks?: DownloadTask[];
  }) => {
    const mode = opts.mode;
    setDeleteMode(mode);
    if (mode === 'single') {
      const task = opts.task ?? null;
      setPendingDelete(task);
      setDeleteCount(task ? 1 : 0);
      setDeleteCanFile(taskCanDeleteLocalFile(task));
    } else {
      const tasks = opts.tasks ?? [];
      setPendingDelete(null);
      setDeleteCount(tasks.length);
      setDeleteCanFile(tasks.some((t) => taskCanDeleteLocalFile(t)));
    }
    setDeleteOpen(true);
  };

  const performDeleteOne = async (task: DownloadTask, deleteFiles: boolean) => {
    await service.delete(task.id, {
      deleteFiles: task.fileMissing ? false : deleteFiles,
    });
  };

  const performDeleteMany = async (tasks: DownloadTask[], deleteFiles: boolean) => {
    const ids = tasks.map((t) => t.id);
    return service.deleteMany(ids, { deleteFiles });
  };

  const notifyDeleteOne = (task: DownloadTask, deleteFiles: boolean) => {
    const name = task.title?.trim() || task.url || '任务';
    const didDeleteFile = Boolean(deleteFiles) && !task.fileMissing;
    showAppToast({
      title: '已删除',
      description: didDeleteFile
        ? `已删除「${name}」及本地文件`
        : `已从列表移除「${name}」`,
      variant: 'success',
    });
  };

  const notifyDeleteMany = (count: number, deleteFiles: boolean, mode: 'batch' | 'clear') => {
    if (mode === 'clear') {
      showAppToast({
        title: '已清空',
        description: deleteFiles
          ? `已清除 ${count} 条记录及对应本地文件`
          : `已清除 ${count} 条记录`,
        variant: 'success',
      });
      return;
    }
    showAppToast({
      title: '已删除',
      description: deleteFiles
        ? `已删除 ${count} 个任务及对应本地文件`
        : `已删除 ${count} 个任务`,
      variant: 'success',
    });
  };

  const requestDelete = async (task: DownloadTask) => {
    const app = settingsStore.state.app;
    if (
      taskCanDeleteLocalFile(task) &&
      app.rememberDeleteDownloadHubFileAction &&
      app.deleteDownloadHubFileAction !== undefined
    ) {
      try {
        const deleteFiles = app.deleteDownloadHubFileAction;
        await performDeleteOne(task, deleteFiles);
        notifyDeleteOne(task, deleteFiles);
      } catch (e) {
        showAppToast({
          title: '删除失败',
          description: e instanceof Error ? e.message : String(e),
          variant: 'error',
        });
      }
      return;
    }
    // 无本地文件（文件丢失 / 未落盘等）：已勾选「不再提示」则直接删记录
    if (!taskCanDeleteLocalFile(task) && app.skipConfirmDeleteDownloadHubNoFile) {
      try {
        await performDeleteOne(task, false);
        notifyDeleteOne(task, false);
      } catch (e) {
        showAppToast({
          title: '删除失败',
          description: e instanceof Error ? e.message : String(e),
          variant: 'error',
        });
      }
      return;
    }
    openDeleteDialog({ mode: 'single', task });
  };

  const requestClearAll = () => {
    const tasks = taskStore.list;
    if (tasks.length === 0) {
      showAppToast({ title: '暂无下载记录', variant: 'default' });
      return;
    }
    const app = settingsStore.state.app;
    const canFile = tasks.some((t) => taskCanDeleteLocalFile(t));
    if (
      canFile &&
      app.rememberDeleteDownloadHubFileAction &&
      app.deleteDownloadHubFileAction !== undefined
    ) {
      void (async () => {
        setBusy(true);
        try {
          const deleteFiles = Boolean(app.deleteDownloadHubFileAction);
          const n = await service.deleteMany(
            tasks.map((t) => t.id),
            { deleteFiles },
          );
          clearSelection();
          notifyDeleteMany(n, deleteFiles, 'clear');
        } catch (e) {
          showAppToast({
            title: '清空失败',
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          });
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    if (!canFile && app.skipConfirmDeleteDownloadHubNoFile) {
      void (async () => {
        setBusy(true);
        try {
          const n = await service.deleteMany(
            tasks.map((t) => t.id),
            { deleteFiles: false },
          );
          clearSelection();
          notifyDeleteMany(n, false, 'clear');
        } catch (e) {
          showAppToast({
            title: '清空失败',
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          });
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    openDeleteDialog({ mode: 'clear', tasks });
  };

  const requestBatchDelete = () => {
    const tasks = selectedTasks();
    if (tasks.length === 0) return;
    const app = settingsStore.state.app;
    const canFile = tasks.some((t) => taskCanDeleteLocalFile(t));
    if (
      canFile &&
      app.rememberDeleteDownloadHubFileAction &&
      app.deleteDownloadHubFileAction !== undefined
    ) {
      void (async () => {
        setBusy(true);
        try {
          const deleteFiles = Boolean(app.deleteDownloadHubFileAction);
          const n = await performDeleteMany(tasks, deleteFiles);
          clearSelection();
          notifyDeleteMany(n, deleteFiles, 'batch');
        } catch (e) {
          showAppToast({
            title: '删除失败',
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          });
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    if (!canFile && app.skipConfirmDeleteDownloadHubNoFile) {
      void (async () => {
        setBusy(true);
        try {
          const n = await performDeleteMany(tasks, false);
          clearSelection();
          notifyDeleteMany(n, false, 'batch');
        } catch (e) {
          showAppToast({
            title: '删除失败',
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          });
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    openDeleteDialog({ mode: 'batch', tasks });
  };

  const confirmDeleteDialog = async (deleteFile: boolean) => {
    setBusy(true);
    try {
      if (deleteMode() === 'single') {
        const task = pendingDelete();
        if (!task) return;
        await performDeleteOne(task, deleteFile);
        notifyDeleteOne(task, deleteFile);
      } else if (deleteMode() === 'clear') {
        const n = await service.deleteMany(
          taskStore.list.map((t) => t.id),
          { deleteFiles: deleteFile },
        );
        clearSelection();
        notifyDeleteMany(n, deleteFile, 'clear');
      } else {
        const tasks = selectedTasks();
        const n = await performDeleteMany(tasks, deleteFile);
        clearSelection();
        notifyDeleteMany(n, deleteFile, 'batch');
      }
    } catch (e) {
      showAppToast({
        title: '删除失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  };

  const batchPause = async () => {
    const tasks = selectedTasks().filter(canPauseTask);
    if (tasks.length === 0) return;
    setBusy(true);
    try {
      for (const t of tasks) await service.pause(t.id);
      showAppToast({ title: '已暂停', description: `${tasks.length} 个任务` });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const batchResume = async () => {
    const tasks = selectedTasks().filter(canResumeTask);
    if (tasks.length === 0) return;
    setBusy(true);
    try {
      for (const t of tasks) await service.resume(t.id);
      showAppToast({ title: '已继续', description: `${tasks.length} 个任务` });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const batchRetry = async () => {
    const tasks = selectedTasks().filter(canRetryTask);
    if (tasks.length === 0) return;
    setBusy(true);
    try {
      for (const t of tasks) await service.resume(t.id);
      showAppToast({ title: '已重试', description: `${tasks.length} 个任务` });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const batchMerge = async () => {
    const tasks = selectedTasks().filter(canMergeTask);
    if (tasks.length === 0) return;
    setBusy(true);
    try {
      for (const t of tasks) await service.resume(t.id);
      showAppToast({ title: '已开始合并', description: `${tasks.length} 个任务` });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const batchActionItems = () => {
    const caps = selectionCaps();
    return (
      <>
        <AppDropdownMenuItem
          disabled={!caps.canPause || busy()}
          onSelect={() => void batchPause()}
        >
          暂停所选
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!caps.canResume || busy()}
          onSelect={() => void batchResume()}
        >
          继续所选
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!caps.canRetry || busy()}
          onSelect={() => void batchRetry()}
        >
          重试所选
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!caps.canMerge || busy()}
          onSelect={() => void batchMerge()}
        >
          合并所选
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          disabled={!caps.canDelete || busy()}
          class="text-destructive focus:text-destructive"
          onSelect={() => requestBatchDelete()}
        >
          删除所选
        </AppDropdownMenuItem>
      </>
    );
  };

  return (
    <DownloadHubPageShell
      section="tasks"
      delegateScroll
      toolbar={
        <>
          <AppSelect
            value={filter()}
            onChange={(v) => setFilter((v as TaskFilter) || 'all')}
            options={[...FILTER_OPTIONS]}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {FILTER_LABELS[itemProps.item.rawValue as TaskFilter]}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="compact" class="w-28" aria-label="任务筛选">
              <AppSelectValue>
                {(state) =>
                  FILTER_LABELS[(state.selectedOption() as TaskFilter) || 'all']
                }
              </AppSelectValue>
              <AppSelectIcon />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectListbox />
            </AppSelectContent>
          </AppSelect>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
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
            </AppTooltipTrigger>
            <AppTooltipContent>刷新</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              size="icon"
              variant="ghost"
              class="h-9 w-9"
              onClick={() => setDownloadSection('create')}
              aria-label="新建"
            >
              <PlusIcon class="size-4" />
            </AppTooltipTrigger>
            <AppTooltipContent>新建下载</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              size="icon"
              variant="ghost"
              class="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => requestClearAll()}
              disabled={busy() || taskStore.list.length === 0}
              aria-label="清空下载记录"
            >
              <TrashIcon class="size-4" />
            </AppTooltipTrigger>
            <AppTooltipContent>清空下载记录</AppTooltipContent>
          </AppTooltip>
        </>
      }
    >
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class={cn(
            mainShellPageScroll,
            downloadHubContentInsetClass,
            'flex min-h-0 flex-1 flex-col gap-4 pb-4 pt-2',
          )}
        >
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
                      selected={isSelected(task.id)}
                      onToggleSelection={() => toggleSelection(task.id)}
                      onSelectionChange={(checked) =>
                        setSelectionChecked(task.id, checked)
                      }
                      onPause={(t) => void pauseTask(t)}
                      onResume={(t) => void resumeTask(t)}
                      onRetry={(t) => void retryTask(t)}
                      onMerge={(t) => void mergeTask(t)}
                      onRemove={(t) => void requestDelete(t)}
                    />
                  </Show>
                )}
              </For>
            </ul>
          </Show>
        </div>

        {/* 底部固定：批量操作栏（与书源/订阅管理页一致） */}
        <div class="shrink-0 border-t border-border px-3 py-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                disabled={visibleCount() === 0 || busy()}
              >
                {allFilteredSelected() ? '取消全选' : '全选'}(
                {filteredSelectedCount()}/{visibleCount()})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={selectedCount() === 0 || busy()}
              >
                取消选中
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={invertSelection}
                disabled={visibleCount() === 0 || busy()}
              >
                反选
              </Button>
            </div>

            <div class="flex min-[448px]:hidden! items-center gap-2">
              <AppDropdownMenu>
                <AppDropdownMenuTrigger
                  as={(p: Record<string, unknown>) => (
                    <AppDropdownMenuButtonTrigger
                      triggerProps={p}
                      variant="outline"
                      size="sm"
                      class={BATCH_MENU_TRIGGER_CLASS}
                    >
                      操作
                      <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                    </AppDropdownMenuButtonTrigger>
                  )}
                />
                <AppDropdownMenuContent layout="compact">
                  {batchActionItems()}
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            </div>

            <div class="hidden min-[448px]:flex xl:hidden! items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={!selectionCaps().canDelete || busy()}
                onClick={() => requestBatchDelete()}
              >
                删除所选
              </Button>
              <AppDropdownMenu>
                <AppDropdownMenuTrigger
                  as={(p: Record<string, unknown>) => (
                    <AppDropdownMenuButtonTrigger
                      triggerProps={p}
                      variant="outline"
                      size="sm"
                      class={BATCH_MENU_TRIGGER_CLASS}
                    >
                      更多
                      <ChevronDownIcon class={BATCH_MENU_CHEVRON_CLASS} />
                    </AppDropdownMenuButtonTrigger>
                  )}
                />
                <AppDropdownMenuContent layout="compact">
                  <AppDropdownMenuItem
                    disabled={!selectionCaps().canPause || busy()}
                    onSelect={() => void batchPause()}
                  >
                    暂停所选
                  </AppDropdownMenuItem>
                  <AppDropdownMenuItem
                    disabled={!selectionCaps().canResume || busy()}
                    onSelect={() => void batchResume()}
                  >
                    继续所选
                  </AppDropdownMenuItem>
                  <AppDropdownMenuItem
                    disabled={!selectionCaps().canRetry || busy()}
                    onSelect={() => void batchRetry()}
                  >
                    重试所选
                  </AppDropdownMenuItem>
                  <AppDropdownMenuItem
                    disabled={!selectionCaps().canMerge || busy()}
                    onSelect={() => void batchMerge()}
                  >
                    合并所选
                  </AppDropdownMenuItem>
                </AppDropdownMenuContent>
              </AppDropdownMenu>
            </div>

            <div class="hidden xl:flex! flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!selectionCaps().canPause || busy()}
                onClick={() => void batchPause()}
              >
                暂停所选
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectionCaps().canResume || busy()}
                onClick={() => void batchResume()}
              >
                继续所选
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectionCaps().canRetry || busy()}
                onClick={() => void batchRetry()}
              >
                重试所选
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectionCaps().canMerge || busy()}
                onClick={() => void batchMerge()}
              >
                合并所选
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!selectionCaps().canDelete || busy()}
                onClick={() => requestBatchDelete()}
              >
                删除所选
              </Button>
            </div>
          </div>
        </div>
      </div>

      <DeleteDownloadHubTaskDialog
        open={deleteOpen()}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setPendingDelete(null);
        }}
        mode={deleteMode()}
        task={pendingDelete()}
        count={deleteCount()}
        canDeleteFile={deleteCanFile()}
        onConfirm={(deleteFile) => {
          void confirmDeleteDialog(deleteFile);
        }}
      />
    </DownloadHubPageShell>
  );
}
