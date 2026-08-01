import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  fetchWatchHistory,
  historyToMediaItem,
  searchWatchHistory,
} from '@/lib/download/bili/history';
import { getMediaInfo } from '@/lib/download/bili/media-info';
import {
  getBiliHubState,
  setBiliHistory,
  setBiliHistoryKeyword,
  setBiliHistoryLoading,
  setBiliMedia,
  setBiliPane,
  setBiliSelected,
} from '@/stores/download-bili/hub';

export function BiliHistoryPane() {
  const hub = getBiliHubState();

  const load = async (append = false) => {
    setBiliHistoryLoading(true);
    try {
      if (hub.historyKeyword.trim()) {
        const list = await searchWatchHistory(hub.historyKeyword.trim(), 1);
        setBiliHistory(list, 0, false);
      } else {
        const { list, nextViewAt } = await fetchWatchHistory(
          append ? hub.historyNext : 0,
        );
        setBiliHistory(list, nextViewAt, append);
      }
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : '加载历史失败',
        variant: 'error',
      });
    } finally {
      setBiliHistoryLoading(false);
    }
  };

  const openEntry = async (index: number) => {
    const entry = hub.history[index];
    if (!entry?.bvid && !entry?.oid) {
      showAppToast({ title: '该历史项无法下载', variant: 'error' });
      return;
    }
    try {
      const id = entry.bvid || `av${entry.oid}`;
      const info = await getMediaInfo(id, 'video');
      setBiliMedia(info);
      setBiliSelected(
        info.list.map((_, i) => i).filter((i) => info.list[i]?.isTarget),
      );
      if (!hub.selected.length && info.list.length) setBiliSelected([0]);
      setBiliPane('search');
      showAppToast({ title: '已载入稿件', variant: 'success' });
    } catch (e) {
      // fallback construct single item
      const item = historyToMediaItem(entry, 0);
      setBiliMedia({
        type: 'video',
        id: entry.bvid || String(entry.oid),
        nfo: {
          tags: [],
          stat: {},
          url: entry.url,
          thumbs: entry.cover ? [{ id: 'cover', url: entry.cover }] : [],
          upper: entry.author
            ? { name: entry.author, mid: entry.authorMid ?? 0, avatar: '' }
            : undefined,
        },
        list: [item],
      });
      setBiliSelected([0]);
      setBiliPane('search');
      void e;
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-2">
      <div class="flex gap-2">
        <AppTextFieldBareInput
          value={hub.historyKeyword}
          onInput={(e) => setBiliHistoryKeyword(e.currentTarget.value)}
          placeholder="搜索观看历史"
          class="flex-1"
        />
        <Button
          size="sm"
          disabled={hub.historyLoading}
          onClick={() => void load(false)}
        >
          查询
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={hub.historyLoading || !hub.historyNext}
          onClick={() => void load(true)}
        >
          更多
        </Button>
      </div>
      <Show when={!hub.history.length && !hub.historyLoading}>
        <div class="py-8 text-center text-sm text-muted-foreground">
          点击查询加载观看历史（需登录）
        </div>
      </Show>
      <div class="min-h-0 flex-1 overflow-auto rounded border border-border/40">
        <For each={hub.history}>
          {(entry, i) => (
            <button
              type="button"
              class="flex w-full items-center gap-3 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40"
              onClick={() => void openEntry(i())}
            >
              <Show when={entry.cover}>
                <img
                  src={entry.cover}
                  alt=""
                  class="h-12 w-20 shrink-0 rounded object-cover"
                />
              </Show>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{entry.title}</div>
                <div class="text-xs text-muted-foreground">
                  {entry.author || ''} · {entry.bvid || entry.oid || ''}
                </div>
              </div>
              <Button size="sm" variant="outline">
                载入
              </Button>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
