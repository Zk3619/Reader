/**
 * 播放详情评论面板
 */

import { createEffect, createSignal, For, Show, type Component } from 'solid-js';
import { Heart, LoaderCircle, MessageCircle } from 'lucide-solid';
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
  class?: string;
}

export const MusicCommentPane: Component<MusicCommentPaneProps> = (props) => {
  const [sort, setSort] = createSignal<CommentSort>('hot');
  const [page, setPage] = createSignal(1);
  const [comments, setComments] = createSignal<MusicComment[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(false);
  const [error, setError] = createSignal('');
  let requestId = 0;

  const load = async (reset = false) => {
    const t = props.track;
    if (!t) return;
    const currentRequest = ++requestId;
    setLoading(true);
    setError('');
    try {
      const nextPage = reset ? 1 : page();
      const result = await fetchTrackComments(t, nextPage, sort());
      if (currentRequest !== requestId) return;
      setComments((prev) => (reset ? result.comments : [...prev, ...result.comments]));
      setHasMore(result.hasMore);
      if (reset) setPage(1);
      else setPage(nextPage);
    } catch (cause) {
      if (currentRequest === requestId) {
        setError(cause instanceof Error ? cause.message : '评论加载失败');
      }
    } finally {
      if (currentRequest === requestId) setLoading(false);
    }
  };

  createEffect(() => {
    const t = props.track;
    if (!t) {
      setComments([]);
      return;
    }
    void t.id;
    setComments([]);
    void load(true);
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
      const currentRequest = ++requestId;
      setLoading(true);
      setError('');
      try {
        const result = await fetchTrackComments(t, next, sort());
        if (currentRequest !== requestId) return;
        setComments((prev) => [...prev, ...result.comments]);
        setHasMore(result.hasMore);
      } catch (cause) {
        if (currentRequest === requestId) {
          setError(cause instanceof Error ? cause.message : '评论加载失败');
        }
      } finally {
        if (currentRequest === requestId) setLoading(false);
      }
    })();
  };

  return (
    <div class={cn('flex min-h-0 flex-1 flex-col text-sm', props.class)}>
      <div class="mb-3 flex shrink-0 rounded-lg bg-muted/50 p-1">
        {(['hot', 'latest'] as const).map((tab) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class={cn(
              'h-8 flex-1 rounded-md px-3 text-xs',
              sort() === tab
                ? 'bg-background font-medium text-foreground shadow-sm hover:bg-background'
                : 'text-muted-foreground',
            )}
            onClick={() => switchSort(tab)}
          >
            {tab === 'hot' ? '热门' : '最新'}
          </Button>
        ))}
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <Show when={loading() && comments().length === 0}>
          <div class="flex h-32 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle class="h-4 w-4 animate-spin" />
            <span>加载评论…</span>
          </div>
        </Show>
        <Show when={error() && comments().length === 0}>
          <div class="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center">
            <p class="text-sm text-destructive">{error()}</p>
            <Button size="sm" variant="outline" onClick={() => void load(true)}>
              重新加载
            </Button>
          </div>
        </Show>
        <Show when={!loading() && !error() && comments().length === 0}>
          <div class="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageCircle class="h-8 w-8 opacity-40" />
            <p>还没有评论</p>
          </div>
        </Show>
        <ul class="divide-y divide-border/60">
          <For each={comments()}>
            {(c) => (
              <li class="flex gap-3 px-1 py-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {c.user.trim().slice(0, 1).toUpperCase() || '匿'}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-xs font-medium">{c.user}</p>
                    <Show when={c.time}>
                      <span class="shrink-0 text-[11px] text-muted-foreground">{c.time}</span>
                    </Show>
                  </div>
                  <p class="mt-1 whitespace-pre-wrap wrap-break-word text-sm leading-6 text-foreground/85">
                    {c.content}
                  </p>
                  <Show when={(c.likedCount ?? 0) > 0}>
                    <span class="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Heart class="h-3 w-3" />
                      {c.likedCount}
                    </span>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
        <Show when={error() && comments().length > 0}>
          <p class="py-2 text-center text-xs text-destructive">{error()}</p>
        </Show>
        <Show when={hasMore()}>
          <Button
            size="sm"
            variant="ghost"
            class="mt-2 w-full text-xs text-muted-foreground"
            disabled={loading()}
            onClick={() => loadMore()}
          >
            <Show when={loading()} fallback="加载更多">
              <LoaderCircle class="mr-1.5 h-3.5 w-3.5 animate-spin" />
              加载中…
            </Show>
          </Button>
        </Show>
      </div>
    </div>
  );
};
