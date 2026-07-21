/**
 * 下载页曲目列表 — 扁平 VirtualList，对齐「我的列表 / 搜索」行样式
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VirtualList } from '@/components/shared/virtual-list/VirtualList';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { PlayIcon } from '@/components/shared/icons';
import { MusicDownloadContextMenu } from '@/components/media/viewer/audio/music/hub/MusicDownloadContextMenu';
import { shouldAcceptListPlayGesture } from '@/components/media/viewer/audio/music/hub/list-track-play-gesture';
import {
  type AudioDownloadTask,
  type DownloadTaskStatus,
  playDownloadTask,
} from '@/lib/media/audio/audio-download';
import { QUALITY_LABELS } from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { searchSourceLabel } from '@/lib/media/audio/online/source-router';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import {
  MUSIC_DESKTOP_TRACK_CELL_CLASS,
  MUSIC_DESKTOP_TRACK_GRID_CLASS,
  MUSIC_DESKTOP_TRACK_LIST_MIN_WIDTH_CLASS,
  musicDownloadDesktopTrackGridTemplate,
} from '@/lib/media/audio/music-desktop-track-cols';
import { viewerStore } from '@/stores/viewer';
import { cn } from '@/lib/utils';
import { createResource, Show, type Component } from 'solid-js';

const DESKTOP_ROW_HEIGHT_PX = 44;
const MOBILE_ROW_HEIGHT_PX = 56;

const STATUS_LABELS: Record<DownloadTaskStatus, string> = {
  waiting: '等待中',
  run: '下载中',
  pause: '已暂停',
  error: '出错',
  completed: '已完成',
};

export interface DownloadTrackDisplay {
  name: string;
  artist: string;
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatProgressLabel(task: AudioDownloadTask): string {
  if (task.progressTotal > 0) {
    return `${formatBytes(task.progressDownloaded)} / ${formatBytes(task.progressTotal)}`;
  }
  return `${Math.round(task.progress * 100)}%`;
}

function formatStatusLabel(task: AudioDownloadTask): string {
  if (task.status === 'error' && task.error) {
    return toUserFacingMusicError(task.error, '下载失败');
  }
  return task.statusText || STATUS_LABELS[task.status];
}

function qualityLabel(task: AudioDownloadTask): string {
  const q = task.taskMeta?.actualQuality ?? task.quality;
  if (q in QUALITY_LABELS) return QUALITY_LABELS[q as MusicQuality];
  return q || '--';
}

function sourceLabel(task: AudioDownloadTask): string {
  if (!task.resolvedSource) return '';
  if (task.resolvedSource === 'cache') return '播放缓存';
  const label = searchSourceLabel(task.resolvedSource as never);
  return task.taskMeta?.toggled ? `${label}·换源` : label;
}

function desktopGridStyle() {
  return { 'grid-template-columns': musicDownloadDesktopTrackGridTemplate() };
}

function DesktopDownloadHeader() {
  return (
    <div
      class={cn(
        MUSIC_DESKTOP_TRACK_GRID_CLASS,
        'sticky top-0 z-10 h-10 shrink-0 border-b border-border/50 bg-background text-xs font-medium text-muted-foreground',
      )}
      style={desktopGridStyle()}
    >
      <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>#</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>歌曲名</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>艺术家</span>
      <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>进度</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>状态</span>
      <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'tabular-nums')}>音质</span>
      <span class={MUSIC_DESKTOP_TRACK_CELL_CLASS}>来源</span>
    </div>
  );
}

function DownloadTrackRow(props: {
  task: AudioDownloadTask;
  index: number;
  mobile: boolean;
  display?: DownloadTrackDisplay;
  onChanged?: () => void;
}) {
  const isCurrent = () => {
    const current = viewerStore.state.trackQueue[viewerStore.state.trackIndex];
    return current?.id === props.task.trackId;
  };

  const handlePlay = (doubleClick = false) => {
    if (props.task.status !== 'completed') return;
    if (
      !shouldAcceptListPlayGesture(doubleClick, {
        isMobileLayout: props.mobile,
        listDoubleClickToPlay: getMusicSettings().listDoubleClickToPlay,
      })
    ) {
      return;
    }
    void playDownloadTask(props.task).catch((err) =>
      console.warn('[download] play failed', err),
    );
  };

  const title = () => props.display?.name ?? props.task.trackName ?? props.task.fileName ?? props.task.trackId;
  const artist = () => props.display?.artist ?? '未知';
  const statusTone = () =>
    props.task.status === 'error' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <li
      aria-current={isCurrent() ? 'true' : undefined}
      class={cn('list-none border-b border-border/40', isCurrent() && 'bg-primary/5')}
    >
      <MusicDownloadContextMenu
        task={props.task}
        onChanged={props.onChanged}
        showActionButton={props.mobile}
      >
        <Show
          when={props.mobile}
          fallback={
            <div
              role="button"
              tabindex={0}
              class={cn(
                MUSIC_DESKTOP_TRACK_GRID_CLASS,
                'h-11 cursor-pointer text-xs hover:bg-muted/50 sm:text-sm',
              )}
              style={desktopGridStyle()}
              onClick={() => handlePlay(false)}
              onDblClick={() => handlePlay(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handlePlay(false);
                }
              }}
            >
              <span
                class={cn(
                  MUSIC_DESKTOP_TRACK_CELL_CLASS,
                  'flex items-center tabular-nums text-muted-foreground',
                  isCurrent() && 'text-primary',
                )}
              >
                <Show when={isCurrent()} fallback={props.index + 1}>
                  <PlayIcon class="h-3.5 w-3.5" />
                </Show>
              </span>
              <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'flex items-center gap-1.5')}>
                <span class={cn('min-w-0 truncate', isCurrent() && 'text-primary')}>
                  {title()}
                </span>
                <Show when={props.task.status === 'error'}>
                  <Badge
                    variant="outline"
                    class="shrink-0 border-destructive/40 text-[10px] text-destructive"
                  >
                    出错
                  </Badge>
                </Show>
              </span>
              <span class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate text-muted-foreground')}>
                {artist()}
              </span>
              <span
                class={cn(
                  MUSIC_DESKTOP_TRACK_CELL_CLASS,
                  'truncate tabular-nums text-muted-foreground',
                )}
              >
                {formatProgressLabel(props.task)}
              </span>
              <span
                class={cn(MUSIC_DESKTOP_TRACK_CELL_CLASS, 'truncate', statusTone())}
                title={formatStatusLabel(props.task)}
              >
                {formatStatusLabel(props.task)}
              </span>
              <span
                class={cn(
                  MUSIC_DESKTOP_TRACK_CELL_CLASS,
                  'truncate tabular-nums text-muted-foreground',
                )}
              >
                {qualityLabel(props.task)}
              </span>
              <span
                class={cn(
                  MUSIC_DESKTOP_TRACK_CELL_CLASS,
                  'truncate text-muted-foreground',
                )}
              >
                {sourceLabel(props.task) || '--'}
              </span>
            </div>
          }
        >
          <div class="flex min-h-14 w-full items-center py-0 pl-1 pr-11 hover:bg-muted/50">
            <Button
              type="button"
              variant="ghost"
              class="h-full min-w-0 flex-1 justify-start gap-2 rounded-none px-1 font-normal"
              onClick={() => handlePlay(false)}
              onDblClick={() => handlePlay(true)}
            >
              <span
                class={cn(
                  'w-8 shrink-0 text-left text-xs tabular-nums text-muted-foreground',
                  isCurrent() && 'text-primary',
                )}
              >
                <Show when={isCurrent()} fallback={props.index + 1}>
                  <PlayIcon class="h-3.5 w-3.5" />
                </Show>
              </span>
              <span class="min-w-0 flex-1 overflow-hidden text-left">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class={cn('min-w-0 truncate text-sm', isCurrent() && 'text-primary')}>
                    {title()}
                  </span>
                  <Show when={props.task.status === 'error'}>
                    <Badge
                      variant="outline"
                      class="shrink-0 border-destructive/40 text-[10px] text-destructive"
                    >
                      出错
                    </Badge>
                  </Show>
                </span>
                <span class={cn('block truncate text-xs', statusTone())}>
                  {artist()} · {formatStatusLabel(props.task)} · {formatProgressLabel(props.task)}
                  <Show when={sourceLabel(props.task)}>
                    {' · '}
                    {sourceLabel(props.task)}
                  </Show>
                </span>
              </span>
              <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
                {qualityLabel(props.task)}
              </span>
            </Button>
          </div>
        </Show>
      </MusicDownloadContextMenu>
    </li>
  );
}

async function loadDownloadTrackDisplay(
  tasks: AudioDownloadTask[],
): Promise<Map<string, DownloadTrackDisplay>> {
  const { getAudioTrack } = await import('@/lib/database/audio-library');
  const map = new Map<string, DownloadTrackDisplay>();
  const uniqueTrackIds = [...new Set(tasks.map((task) => task.trackId))];
  await Promise.all(
    uniqueTrackIds.map(async (trackId) => {
      const track = await getAudioTrack(trackId);
      if (!track) return;
      map.set(trackId, {
        name: track.name,
        artist: track.artist?.trim() || '未知',
      });
    }),
  );
  return map;
}

export interface MusicDownloadTrackListProps {
  tasks: AudioDownloadTask[];
  onChanged?: () => void;
  class?: string;
}

export const MusicDownloadTrackList: Component<MusicDownloadTrackListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const [displayByTrackId] = createResource(
    () => props.tasks.map((task) => task.trackId).join('\n'),
    () => loadDownloadTrackDisplay(props.tasks),
  );

  return (
    <div class={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', props.class)}>
      <Show
        when={props.tasks.length > 0}
        fallback={<p class="px-4 py-4 text-sm text-muted-foreground">暂无下载任务。</p>}
      >
        <div
          class={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            !isMobileLayout() && 'overflow-x-auto',
          )}
        >
          <div
            class={cn(
              'flex min-h-0 w-full flex-1 flex-col',
              !isMobileLayout() && MUSIC_DESKTOP_TRACK_LIST_MIN_WIDTH_CLASS,
            )}
          >
            <VirtualList<AudioDownloadTask>
              items={() => props.tasks}
              estimateSize={() => (isMobileLayout() ? MOBILE_ROW_HEIGHT_PX : DESKTOP_ROW_HEIGHT_PX)}
              overscan={10}
              class="min-h-0 flex-1"
              scrollGutter={isMobileLayout() ? 'auto' : 'both'}
              getItemKey={(task) => task.id}
              remeasureWhen={isMobileLayout}
              scrollHeader={!isMobileLayout() ? <DesktopDownloadHeader /> : undefined}
            >
              {(task, index) => (
                <DownloadTrackRow
                  task={task}
                  index={index}
                  mobile={isMobileLayout()}
                  display={displayByTrackId()?.get(task.trackId)}
                  onChanged={props.onChanged}
                />
              )}
            </VirtualList>
          </div>
        </div>
      </Show>
    </div>
  );
};
