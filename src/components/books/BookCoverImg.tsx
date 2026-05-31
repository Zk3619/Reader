/**
 * 书籍封面：跨域一律 fetch → blob，避免 CDN 403 / CORB。
 */

import { createEffect, createSignal, on, onCleanup, onMount, Show, type JSX } from 'solid-js';
import type { BookSource } from '@/types';
import { BookCoverPlaceholderIcon } from '@/components/bookshelf/book-group-cover-icon';
import {
  isNoCoverImageUrl,
  shouldFetchCoverAsBlob,
} from '@/lib/http/cover-image-loader';
import {
  getCoverSessionStatus,
  readCoverSessionBlobReactive,
  scheduleCoverSessionLoad,
} from '@/lib/http/cover-session';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import {
  useVirtualListScrollCoalesce,
  useVirtualListScrollIdle,
} from '@/components/shared/virtual-list/virtual-list-scroll-coalesce';
import { cn } from '@/lib/utils';

export interface BookCoverImgProps {
  src?: string | null;
  referer?: string | null;
  source?: BookSource | null;
  bookUrl?: string | null;
  onCoverUrlRefreshed?: (newUrl: string) => void;
  alt?: string;
  class?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  fallback?: JSX.Element;
  deferLoadUntilVisible?: boolean;
}

function defaultCoverFallback(): JSX.Element {
  return (
    <div class="flex h-full w-full items-center justify-center">
      <BookCoverPlaceholderIcon class="h-8 w-8 text-muted-foreground" size={32} />
    </div>
  );
}

export function BookCoverImg(props: BookCoverImgProps) {
  const [failed, setFailed] = createSignal(false);
  const [mayLoad, setMayLoad] = createSignal(!props.deferLoadUntilVisible);
  let visibilityRoot: HTMLDivElement | undefined;
  const scrollIdle = useVirtualListScrollIdle();
  const scrollCoalesce = useVirtualListScrollCoalesce();

  onMount(() => {
    if (!props.deferLoadUntilVisible) return;
    const el = visibilityRoot;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMayLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setMayLoad(true);
      },
      { rootMargin: '80px' },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  const normalizedSrc = () => {
    const raw = props.src?.trim();
    return raw ? normalizeImageUrl(raw) : '';
  };

  const isListCover = () => !!props.deferLoadUntilVisible;

  const noCover = () => isNoCoverImageUrl(normalizedSrc());

  const peekOpts = () => ({
    referer: props.referer,
    source: props.source,
    bookUrl: props.bookUrl,
  });

  const loadOpts = () => ({
    ...peekOpts(),
    skipDiskRead: isListCover(),
    onCoverUrlRefreshed: props.onCoverUrlRefreshed
      ? (newUrl: string) => {
          const next = normalizeImageUrl(newUrl);
          const current = normalizedSrc();
          if (!next || next === current) return;
          const notify = () => props.onCoverUrlRefreshed!(next);
          if (scrollCoalesce) scrollCoalesce.runWhenIdle(notify);
          else notify();
        }
      : undefined,
  });

  const blobSrc = () => {
    if (noCover()) return null;
    const norm = normalizedSrc();
    if (!norm || !shouldFetchCoverAsBlob(norm)) return null;
    return readCoverSessionBlobReactive(props.bookUrl, norm, peekOpts());
  };

  const displaySrc = () => {
    if (noCover()) return undefined;
    const norm = normalizedSrc();
    if (!norm) return undefined;
    if (shouldFetchCoverAsBlob(norm)) {
      return blobSrc() ?? undefined;
    }
    return norm;
  };

  const showImg = () => !noCover() && !!displaySrc() && !failed();

  const fallbackEl = () => props.fallback ?? defaultCoverFallback();

  const needsBookSourceForCover = () => {
    const r = props.referer?.trim();
    return !r || !/^https?:\/\//i.test(r);
  };

  createEffect(
    on(
      () => ({
        norm: normalizedSrc(),
        book: props.bookUrl?.trim() ?? '',
        mayLoad: mayLoad(),
        idle: scrollIdle(),
        hasSource: !!props.source,
        noCover: noCover(),
      }),
      (cur) => {
        if (cur.noCover) {
          setFailed(true);
          return;
        }

        if (!cur.mayLoad || !cur.norm || !shouldFetchCoverAsBlob(cur.norm)) {
          return;
        }
        if (needsBookSourceForCover() && !cur.hasSource) {
          return;
        }

        const status = getCoverSessionStatus(cur.book);
        if (status === 'fail') {
          setFailed(true);
          return;
        }
        setFailed(false);

        if (readCoverSessionBlobReactive(cur.book, cur.norm, peekOpts())) {
          return;
        }

        if (!cur.idle) {
          return;
        }

        scheduleCoverSessionLoad(cur.book, cur.norm, loadOpts(), true);
      },
    ),
  );

  const coverStack = () => (
    <div class="relative h-full w-full min-h-0 min-w-0 overflow-hidden">
      <div
        class={cn(
          'absolute inset-0 z-0 flex items-center justify-center',
          showImg() ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
      >
        {fallbackEl()}
      </div>
      <Show when={showImg()}>
        <img
          src={displaySrc()!}
          alt={props.alt ?? ''}
          class={cn('relative z-[1] h-full w-full object-cover', props.class)}
          loading={props.loading}
          draggable={props.draggable}
          onError={() => setFailed(true)}
        />
      </Show>
    </div>
  );

  if (props.deferLoadUntilVisible) {
    return <div ref={visibilityRoot} class="h-full w-full min-h-0 min-w-0">{coverStack()}</div>;
  }

  return (
    <Show when={showImg()} fallback={fallbackEl()}>
      <img
        src={displaySrc()!}
        alt={props.alt ?? ''}
        class={props.class}
        loading={props.loading}
        draggable={props.draggable}
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
