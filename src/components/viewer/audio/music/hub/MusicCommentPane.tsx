/**
 * 播放详情评论面板（对齐 lx MusicComment / CommentFloor）
 * - 热门 / 最新分页加载
 * - 递归嵌套回复：左侧缩进 + 浅底色块
 */

import { createEffect, createSignal, For, Show, type Component } from 'solid-js';
import { LoaderCircle, MessageCircle, ThumbsUp } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { MusicCommentListSkeleton } from '@/components/viewer/audio/music/hub/MusicHubSkeletons';
import {
  fetchTrackComments,
  type CommentSort,
  type MusicComment,
} from '@/lib/media/audio/music-sdk/comment';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import type { AudioTrack } from '@/lib/media/audio/track-types';

export interface MusicCommentPaneProps {
  track: AudioTrack | undefined;
  class?: string;
}

/** 头像：优先远端图，失败回落到首字 */
const CommentAvatar: Component<{ src?: string | null; name: string }> = (props) => {
  const [broken, setBroken] = createSignal(false);
  const letter = () => props.name.trim().slice(0, 1).toUpperCase() || '匿';
  return (
    <Show
      when={props.src && !broken()}
      fallback={
        <div class="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-sm font-semibold text-primary shadow-sm">
          {letter()}
        </div>
      }
    >
      <img
        src={props.src!}
        alt=""
        class="h-10 w-10 rounded object-cover shadow-sm"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </Show>
  );
};

/** 对齐 lx CommentFloor：列表项 + 递归 reply */
const CommentFloor: Component<{
  comments: MusicComment[];
  nested?: boolean;
}> = (props) => (
  <ul class={cn(!props.nested && 'pl-2.5')}>
    <For each={props.comments}>
      {(item, index) => (
        <li
          class={cn(
            'border-b border-dashed border-primary/20',
            props.nested && index() === props.comments.length - 1 && 'border-b-0',
          )}
        >
          <div class="flex gap-2.5 py-3 text-xs">
            <div class="shrink-0">
              <CommentAvatar src={item.avatar} name={item.user} />
            </div>
            <div class={cn('min-w-0 flex-1', props.nested && 'pr-2.5')}>
              <div class="flex h-10 w-full items-start gap-3 leading-snug text-muted-foreground">
                <div class="flex min-w-0 flex-1 flex-col justify-evenly self-stretch">
                  <p class="truncate text-foreground/80">{item.user}</p>
                  <div class="flex min-w-0 gap-2.5 overflow-hidden text-xs">
                    <Show when={item.time}>
                      <time class="shrink-0">{item.time}</time>
                    </Show>
                    <Show when={item.location}>
                      <span class="truncate">来自{item.location}</span>
                    </Show>
                  </div>
                </div>
                <Show when={item.likedCount != null}>
                  <div class="flex shrink-0 items-start gap-0.5 pt-0.5 text-xs">
                    <ThumbsUp class="mt-px h-3 w-3 text-primary/50" />
                    <span>{item.likedCount}</span>
                  </div>
                </Show>
              </div>
              <p class="whitespace-pre-wrap break-all text-justify text-sm leading-normal text-foreground">
                {item.content}
              </p>
              <Show when={item.images && item.images.length > 0}>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  <For each={item.images}>
                    {(url) => (
                      <img
                        src={url}
                        alt=""
                        class="max-w-60 rounded object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
          <Show when={item.reply && item.reply.length > 0}>
            {/* 对齐 lx .reply_floor：同一元素上 margin + padding + 浅底，保证头像不贴边 */}
            <div class="mb-3 ml-1.5 rounded-lg bg-primary/5 pl-4 pr-2.5">
              <CommentFloor comments={item.reply!} nested />
            </div>
          </Show>
        </li>
      )}
    </For>
  </ul>
);

export const MusicCommentPane: Component<MusicCommentPaneProps> = (props) => {
  const [sort, setSort] = createSignal<CommentSort>('hot');
  const [page, setPage] = createSignal(1);
  const [comments, setComments] = createSignal<MusicComment[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [hasMore, setHasMore] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const showCommentSkeleton = useSkeletonLoading(
    () => loading() && comments().length === 0,
  );
  let requestId = 0;
  let listEl: HTMLDivElement | undefined;

  const notifyCommentError = (cause: unknown) => {
    showAppToast({
      title: '评论加载失败',
      description: toUserFacingMusicError(cause, '暂时无法加载评论，请稍后再试'),
      variant: 'destructive',
    });
  };

  const load = async (reset = false) => {
    const t = props.track;
    if (!t) return;
    const currentRequest = ++requestId;
    setLoading(true);
    setFailed(false);
    try {
      const nextPage = reset ? 1 : page();
      const result = await fetchTrackComments(t, nextPage, sort());
      if (currentRequest !== requestId) return;
      setComments((prev) => (reset ? result.comments : [...prev, ...result.comments]));
      setHasMore(result.hasMore);
      if (reset) {
        setPage(1);
        if (listEl) listEl.scrollTop = 0;
      } else setPage(nextPage);
    } catch (cause) {
      if (currentRequest === requestId) {
        setFailed(true);
        notifyCommentError(cause);
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
    if (next === sort()) return;
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
      try {
        const result = await fetchTrackComments(t, next, sort());
        if (currentRequest !== requestId) return;
        setComments((prev) => [...prev, ...result.comments]);
        setHasMore(result.hasMore);
      } catch (cause) {
        if (currentRequest === requestId) {
          notifyCommentError(cause);
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
      <div
        ref={listEl}
        class={cn(
          'min-h-0 flex-1 overflow-y-auto pr-1 transition-opacity',
          loading() && comments().length > 0 && 'opacity-40',
        )}
      >
        <Show when={showCommentSkeleton()}>
          <MusicCommentListSkeleton />
        </Show>
        <Show when={failed() && comments().length === 0 && !showCommentSkeleton()}>
          <div class="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center">
            <p class="text-sm text-muted-foreground">暂时无法加载评论，请稍后再试</p>
            <Button size="sm" variant="outline" onClick={() => void load(true)}>
              重新加载
            </Button>
          </div>
        </Show>
        <Show when={!loading() && !failed() && comments().length === 0}>
          <div class="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageCircle class="h-8 w-8 opacity-40" />
            <p>还没有评论</p>
          </div>
        </Show>
        <Show when={comments().length > 0}>
          <CommentFloor comments={comments()} />
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
