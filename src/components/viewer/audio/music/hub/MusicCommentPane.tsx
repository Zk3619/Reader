/**
 * 播放详情评论 Tab
 */

import { createEffect, createSignal, For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchTrackComments,
  type CommentSort,
  type MusicComment,
} from '@/lib/media/audio/music-sdk/comment';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface MusicCommentPaneProps {
  track: AudioTrack | undefined;
}

export const MusicCommentPane: Component<MusicCommentPaneProps> = (props) => {
  const [sort, setSort] = createSignal<CommentSort>('hot');
  const [page, setPage] = createSignal(1);
  const [comments, setComments] = createSignal<MusicComment[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(false);

  const load = async (reset = false) => {
    const t = props.track;
    if (!t) return;
    setLoading(true);
    try {
      const nextPage = reset ? 1 : page();
      const result = await fetchTrackComments(t, nextPage, sort());
      setComments((prev) => (reset ? result.comments : [...prev, ...result.comments]));
      setHasMore(result.hasMore);
      if (reset) setPage(1);
      else setPage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.track) {
      setComments([]);
      void load(true);
    }
  });

  const switchSort = (next: CommentSort) => {
    setSort(next);
    setPage(1);
    void load(true);
  };

  const loadMore = () => {
    if (!hasMore() || loading()) return;
    const next = page() + 1;
    setPage(next);
    void (async () => {
      const t = props.track;
      if (!t) return;
      setLoading(true);
      try {
        const result = await fetchTrackComments(t, next, sort());
        setComments((prev) => [...prev, ...result.comments]);
        setHasMore(result.hasMore);
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div class="max-h-48 overflow-y-auto text-sm">
      <div class="mb-2 flex gap-2">
        {(['hot', 'latest'] as const).map((tab) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class={cn('h-auto px-0', sort() === tab ? 'font-medium text-primary' : 'text-muted-foreground')}
            onClick={() => switchSort(tab)}
          >
            {tab === 'hot' ? '热门' : '最新'}
          </Button>
        ))}
      </div>
      <Show when={loading() && comments().length === 0}>
        <p class="text-muted-foreground">加载评论…</p>
      </Show>
      <Show when={!loading() && comments().length === 0}>
        <p class="text-muted-foreground">暂无评论</p>
      </Show>
      <ul class="space-y-2">
        <For each={comments()}>
          {(c) => (
            <li class="rounded border p-2">
              <p class="font-medium">{c.user}</p>
              <p class="text-muted-foreground">{c.content}</p>
            </li>
          )}
        </For>
      </ul>
      <Show when={hasMore()}>
        <Button size="sm" variant="ghost" class="mt-2 w-full" onClick={() => loadMore()}>
          加载更多
        </Button>
      </Show>
    </div>
  );
};
