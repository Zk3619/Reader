import { Show } from 'solid-js';
import { Label } from '@/components/ui/label';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import { useChapterBodyPrefetchSettings } from '@/lib/chapter-cache/use-chapter-body-prefetch-settings';
import { cn } from '@/lib/utils';

export type ChapterBodyPrefetchViewerKind = 'text' | 'manga' | 'video' | 'generic';

const VIEWER_INTRO: Record<ChapterBodyPrefetchViewerKind, string> = {
  text: '切章后后台缓存相邻章节正文（仅在线书源）；0 表示关闭。容量与清理策略见设置页「章节正文缓存」。',
  manga:
    '切章后后台缓存相邻章节 HTML（仅在线书源）；与「章内预加载」互补。0 表示关闭。容量与清理见设置页「章节正文缓存」。',
  video:
    '切章后后台缓存相邻章节正文（仅在线书源），便于快速切换剧集；0 表示关闭。容量与清理见设置页「章节正文缓存」。',
  generic:
    '切章后后台缓存相邻章节正文（仅在线书源）；0 表示关闭。容量与清理策略见设置页「章节正文缓存」。',
};

export interface ChapterBodyPrefetchControlsProps {
  class?: string;
  /** 按阅读器类型展示说明文案 */
  viewer?: ChapterBodyPrefetchViewerKind;
  showTitle?: boolean;
}

/** 各 media-viewer 设置抽屉/对话框共用的章节正文预下载控件 */
export function ChapterBodyPrefetchControls(props: ChapterBodyPrefetchControlsProps) {
  const viewerKind = () => props.viewer ?? 'generic';
  const prefetch = useChapterBodyPrefetchSettings();

  return (
    <div class={cn('space-y-3', props.class)}>
      <Show when={props.showTitle !== false}>
        <Label>章节正文预下载</Label>
        <p class="text-xs text-muted-foreground">{VIEWER_INTRO[viewerKind()]}</p>
      </Show>
      <Show
        when={!prefetch.loading()}
        fallback={<p class="text-xs text-muted-foreground">预下载设置加载中…</p>}
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span class="text-sm">向前预下载章节数</span>
            <p class="text-xs text-muted-foreground">从下一章起向后缓存 N 章。</p>
          </div>
          <SettingsNumberField
            value={prefetch.forwardPrefetchNum()}
            min={0}
            max={9999}
            onValueChange={prefetch.persistForward}
          />
        </div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span class="text-sm">向后预下载章节数</span>
            <p class="text-xs text-muted-foreground">
              ≥2 时从上上章起最多回溯 5 章；1=仅上一章。
            </p>
          </div>
          <SettingsNumberField
            value={prefetch.backwardPrefetchNum()}
            min={0}
            max={9999}
            onValueChange={prefetch.persistBackward}
          />
        </div>
      </Show>
    </div>
  );
}
