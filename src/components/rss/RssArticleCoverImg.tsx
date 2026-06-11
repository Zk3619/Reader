/**
 * RSS 列表缩略图：fetch→blob + 书源 Referer（CDN 防盗链）
 */

import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import type { RssSource } from '@/types';
import { BookCoverPlaceholderIcon } from '@/components/bookshelf/book-group-cover-icon';
import { loadRssArticleCoverBlob } from '@/lib/rss-source/rss-cover-image';
import { isNoCoverImageUrl } from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { cn } from '@/lib/utils';

export interface RssArticleCoverImgProps {
  source: RssSource;
  url?: string | null;
  /** 含 aspect-* 时加在外层，保证占位高度 */
  class?: string;
}

export function RssArticleCoverImg(props: RssArticleCoverImgProps) {
  const [blob, setBlob] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);

  createEffect(() => {
    const raw = props.url?.trim() ?? '';
    const norm = raw ? normalizeImageUrl(raw) : '';
    setBlob(null);
    if (!norm || isNoCoverImageUrl(norm)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    let cancelled = false;
    void loadRssArticleCoverBlob(props.source, norm).then((url) => {
      if (cancelled) return;
      if (url) {
        setBlob(url);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  return (
    <div class={cn('w-full overflow-hidden bg-muted/20', props.class)}>
      <Show
        when={blob() && !failed()}
        fallback={
          <div class="flex h-full min-h-[4rem] w-full items-center justify-center">
            <BookCoverPlaceholderIcon class="h-8 w-8 text-muted-foreground" size={32} />
          </div>
        }
      >
        <img
          src={blob()!}
          alt=""
          class="h-full w-full object-cover"
          loading="lazy"
        />
      </Show>
    </div>
  );
}
