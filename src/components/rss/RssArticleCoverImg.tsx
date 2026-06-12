/**
 * RSS 列表缩略图：fetch→blob + 书源 Referer（CDN 防盗链）
 */

import { createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js';
import type { RssSource } from '@/types';
import { BookCoverPlaceholderIcon } from '@/components/bookshelf/book-group-cover-icon';
import {
  loadRssArticleCoverBlob,
  resolveRssArticleCoverDisplayUrl,
} from '@/lib/rss-source/rss-cover-image';
import { isNoCoverImageUrl } from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import {
  useVirtualListScrollCoalesce,
  useVirtualListScrollIdle,
} from '@/components/shared/virtual-list/virtual-list-scroll-coalesce';
import { cn } from '@/lib/utils';

export interface RssArticleCoverImgProps {
  source: RssSource;
  url?: string | null;
  /** 含 aspect-* 时加在外层，保证占位高度 */
  class?: string;
  /** 列表项默认仅可见且停滚后再拉取，减轻滚动卡顿 */
  deferLoadUntilVisible?: boolean;
}

export function RssArticleCoverImg(props: RssArticleCoverImgProps) {
  const deferVisible = () => props.deferLoadUntilVisible !== false;
  const [blob, setBlob] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [mayLoad, setMayLoad] = createSignal(!deferVisible());
  let visibilityRoot: HTMLDivElement | undefined;
  const scrollIdle = useVirtualListScrollIdle();
  const scrollCoalesce = useVirtualListScrollCoalesce();

  onMount(() => {
    if (!deferVisible()) return;
    const el = visibilityRoot;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMayLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setMayLoad(true);
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  createEffect(
    on(
      () => ({
        raw: props.url?.trim() ?? '',
        source: props.source,
        mayLoad: mayLoad(),
        idle: scrollIdle(),
      }),
      (cur) => {
        const norm = cur.raw ? normalizeImageUrl(cur.raw) : '';
        if (!norm || isNoCoverImageUrl(norm)) {
          setBlob(null);
          setFailed(true);
          return;
        }
        const instant = resolveRssArticleCoverDisplayUrl(cur.source, norm);
        if (instant) {
          setBlob(instant);
          setFailed(false);
          return;
        }
        if (!cur.mayLoad || !cur.idle) {
          return;
        }
        setBlob(null);
        setFailed(false);
        let cancelled = false;
        void loadRssArticleCoverBlob(cur.source, norm).then((url) => {
          if (cancelled) return;
          const apply = () => {
            if (cancelled) return;
            if (url) {
              setBlob(url);
              setFailed(false);
            } else {
              setFailed(true);
            }
          };
          if (scrollCoalesce) scrollCoalesce.runWhenIdle(apply);
          else apply();
        });
        onCleanup(() => {
          cancelled = true;
        });
      },
    ),
  );

  const coverInner = () => (
    <Show
      when={blob() && !failed()}
      fallback={
        <div class="flex h-full min-h-16 w-full items-center justify-center">
          <BookCoverPlaceholderIcon class="h-8 w-8 text-muted-foreground" size={32} />
        </div>
      }
    >
      <img
        src={blob()!}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </Show>
  );

  if (deferVisible()) {
    return (
      <div ref={visibilityRoot} class={cn('w-full overflow-hidden bg-muted/20', props.class)}>
        {coverInner()}
      </div>
    );
  }

  return <div class={cn('w-full overflow-hidden bg-muted/20', props.class)}>{coverInner()}</div>;
}
