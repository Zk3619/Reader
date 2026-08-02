/** 下载队列 UI — AppSelect 筛选 + 扁平 VirtualList（对齐「我的列表」/下载模块任务页） */
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
  type JSX,
} from 'solid-js';
import { Button } from '@/components/ui/button';
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
  type AudioDownloadTask,
  listDownloadTasks,
  processDownloadQueue,
  subscribeDownloadTasks,
} from '@/lib/media/audio/audio-download';
import { AudioPanelShell } from '@/components/media/viewer/audio/music/AudioPanelShell';
import { MusicDownloadTrackList } from '@/components/media/viewer/audio/music/hub/MusicDownloadTrackList';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { RefreshIcon } from '@/components/shared/icons';

export interface AudioDownloadPanelProps {
  open: boolean;
  onClose?: () => void;
  inline?: boolean;
  hideHeader?: boolean;
}

type TabId = 'all' | 'run' | 'pause' | 'error' | 'completed';

const FILTER_OPTIONS = [
  'all',
  'run',
  'pause',
  'error',
  'completed',
] as const satisfies readonly TabId[];

const FILTER_LABELS: Record<TabId, string> = {
  all: '全部',
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

function FilterSelect(props: {
  value: TabId;
  onChange: (tab: TabId) => void;
}): JSX.Element {
  return (
    <AppSelect
      value={props.value}
      onChange={(v) => props.onChange((v as TabId) || 'all')}
      options={[...FILTER_OPTIONS]}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {FILTER_LABELS[itemProps.item.rawValue as TabId]}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="w-28" aria-label="任务筛选">
        <AppSelectValue>
          {(state) => FILTER_LABELS[(state.selectedOption() as TabId) || 'all']}
        </AppSelectValue>
        <AppSelectIcon />
      </AppSelectTrigger>
      <AppSelectContent>
        <AppSelectListbox />
      </AppSelectContent>
    </AppSelect>
  );
}

export const AudioDownloadPanel: Component<AudioDownloadPanelProps> = (props) => {
  const active = () => props.inline || props.open;
  const [tab, setTab] = createSignal<TabId>('all');
  const [tasks, { refetch }] = createResource(() =>
    active() ? listDownloadTasks() : Promise.resolve([]),
  );

  const filtered = createMemo(() => (tasks() ?? []).filter((t) => matchesTab(t, tab())));

  const refresh = () => void processDownloadQueue().then(() => refetch());

  onMount(() => {
    const unsub = subscribeDownloadTasks(() => {
      if (active()) void refetch();
    });
    onCleanup(unsub);
  });

  createEffect(() => {
    if (active()) {
      void processDownloadQueue().then(() => refetch());
    }
  });

  const list = () => (
    <MusicDownloadTrackList tasks={filtered()} onChanged={refresh} />
  );

  return (
    <Show
      when={props.inline}
      fallback={
        <AudioPanelShell
          open={props.open}
          inline={props.inline}
          title="下载任务"
          hideHeader={props.hideHeader}
          onClose={props.onClose}
          class="flex min-h-0 flex-1 flex-col overflow-hidden"
          headerExtra={
            <>
              <FilterSelect value={tab()} onChange={setTab} />
              <Button size="sm" variant="outline" onClick={refresh}>
                刷新
              </Button>
            </>
          }
        >
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden">{list()}</div>
        </AudioPanelShell>
      }
    >
      <MusicHubPageShell
        section="download"
        scrollClass="overflow-hidden"
        toolbar={
          <>
            <FilterSelect value={tab()} onChange={setTab} />
            <Button
              size="icon"
              variant="ghost"
              class="h-9 w-9"
              onClick={refresh}
              aria-label="刷新"
            >
              <RefreshIcon class="size-4" />
            </Button>
          </>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">{list()}</div>
      </MusicHubPageShell>
    </Show>
  );
};
