import { createSignal, For, Show, createEffect, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { searchAllSources } from '@/lib/media/audio/music-sdk/search-all';
import { searchMfSourceTyped } from '@/lib/media/audio/online/mf-plugin/mf-search-hub';
import { AGGREGATE_SEARCH_SOURCE } from '@/lib/media/audio/online/source-router';
import { searchSourceLabel } from '@/lib/media/audio/online/source-router';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import {
  getLinkedLyricRef,
  linkLyricToTrack,
  unlinkLyricFromTrack,
} from '@/lib/media/audio/link-lyric';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';

export interface MusicLinkLyricDialogProps {
  open: boolean;
  track: AudioTrack | null;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
  /** music：按歌曲搜索；lyric：按歌词搜索（MF 插件） */
  searchMode?: 'music' | 'lyric';
}

export const MusicLinkLyricDialog: Component<MusicLinkLyricDialogProps> = (props) => {
  const [keyword, setKeyword] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [results, setResults] = createSignal<AudioTrack[]>([]);

  const linked = () => (props.track ? getLinkedLyricRef(props.track) : null);

  createEffect(() => {
    if (!props.open || !props.track) return;
    const t = props.track;
    setKeyword([t.name, t.artist].filter(Boolean).join(' ').trim());
    setResults([]);
  });

  const runSearch = async () => {
    const q = keyword().trim();
    if (!q) {
      showAppToast({ title: '请输入搜索关键词', variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      if (props.searchMode === 'lyric') {
        const hit = await searchMfSourceTyped(AGGREGATE_SEARCH_SOURCE, q, 1, 'lyric');
        setResults(hit.tracks.slice(0, 40));
        if (hit.tracks.length === 0) {
          showAppToast({ title: '未找到匹配歌词', variant: 'warning' });
        }
        return;
      }
      const { merged } = await searchAllSources(q, 1);
      setResults(merged.slice(0, 40));
      if (merged.length === 0) {
        showAppToast({ title: '未找到匹配歌曲', variant: 'warning' });
      }
    } catch (err) {
      showAppToast({
        title: '搜索失败',
        description: toUserFacingMusicError(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const pick = (target: AudioTrack) => {
    const from = props.track;
    if (!from) return;
    linkLyricToTrack(from, target);
    showAppToast({
      title: '已关联歌词',
      description: `${target.name} · ${target.artist || '未知'}`,
      variant: 'success',
    });
    props.onLinked?.();
    props.onOpenChange(false);
  };

  const unlink = () => {
    const from = props.track;
    if (!from) return;
    unlinkLyricFromTrack(from);
    showAppToast({ title: '已解除歌词关联', variant: 'success' });
    props.onLinked?.();
    props.onOpenChange(false);
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent class="sm:max-w-lg" layout="app">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>
            {props.searchMode === 'lyric' ? '搜索歌词' : '关联歌词'}
          </ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            {props.searchMode === 'lyric'
              ? '通过 MusicFree 插件搜索歌词并关联到当前歌曲。'
              : '为当前歌曲指定另一首曲目的歌词来源（对齐 MusicFree 关联歌词）。'}
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <div class="space-y-3 px-6 pb-2">
          <Show when={linked()}>
            {(ref) => (
              <div class="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                <div class="min-w-0">
                  <p class="truncate font-medium">{ref().title ?? ref().id}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    {ref().artist || ref().platform}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={unlink}>
                  解除
                </Button>
              </div>
            )}
          </Show>
          <div class="flex gap-2">
            <AppTextFieldBareInput
              class="h-9 flex-1"
              placeholder="歌名、歌手"
              value={keyword()}
              onInput={(e) => setKeyword(e.currentTarget.value)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') void runSearch();
              }}
            />
            <Button size="sm" disabled={loading()} onClick={() => void runSearch()}>
              {loading() ? '搜索中…' : '搜索'}
            </Button>
          </div>
          <ul class="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
            <Show
              when={results().length > 0}
              fallback={
                <li class="px-3 py-6 text-center text-xs text-muted-foreground">
                  搜索后从列表中选择用作歌词来源的歌曲
                </li>
              }
            >
              <For each={results()}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => pick(item)}
                    >
                      <span class="min-w-0 flex-1 truncate">
                        {item.name}
                        <span class="text-muted-foreground"> · {item.artist || '未知'}</span>
                      </span>
                      <span class="shrink-0 text-[10px] text-muted-foreground">
                        {searchSourceLabel(String(item.source))}
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </div>
        <ViewerAppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
