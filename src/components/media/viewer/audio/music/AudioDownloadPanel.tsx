/** 下载队列 UI — Tab 筛选 + 扁平 VirtualList（对齐「我的列表」） */
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  Show,
  For,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  type AudioDownloadTask,
  listDownloadTasks,
  processDownloadQueue,
  subscribeDownloadTasks,
} from '@/lib/media/audio/audio-download';
import { AudioPanelShell } from '@/components/media/viewer/audio/music/AudioPanelShell';
import { MusicDownloadTrackList } from '@/components/media/viewer/audio/music/hub/MusicDownloadTrackList';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { cn } from '@/lib/utils';

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

function matchesTab(task: AudioDownloadTask, tab: TabId): boolean {
  if (tab === 'all') return true;
  if (tab === 'run') return task.status === 'run' || task.status === 'waiting';
  return task.status === tab;
}

function DownloadPanelBody(props: {
  inline?: boolean;
  tab: TabId;
  setTab: (tab: TabId) => void;
  filtered: AudioDownloadTask[];
  onRefresh: () => void;
}) {
  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        class={cn(
          'flex shrink-0 flex-wrap gap-1 border-b py-2',
          props.inline ? musicHubPageContentInsetClass : 'px-3',
        )}
      >
        <For each={TABS}>
          {(item) => (
            <Button
              size="sm"
              variant={props.tab === item.id ? 'secondary' : 'ghost'}
              class={cn('h-8', props.tab === item.id && 'font-medium')}
              onClick={() => props.setTab(item.id)}
            >
              {item.label}
            </Button>
          )}
        </For>
      </div>
      <MusicDownloadTrackList tasks={props.filtered} onChanged={props.onRefresh} />
    </div>
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
            <Button size="sm" variant="outline" onClick={refresh}>
              刷新
            </Button>
          }
        >
          <DownloadPanelBody
            tab={tab()}
            setTab={setTab}
            filtered={filtered()}
            onRefresh={refresh}
          />
        </AudioPanelShell>
      }
    >
      <DownloadPanelBody
        inline
        tab={tab()}
        setTab={setTab}
        filtered={filtered()}
        onRefresh={refresh}
      />
    </Show>
  );
};
