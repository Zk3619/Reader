/**
 * 正文插图：跨域 fetch → blob / Web 代理，对齐 BookCoverImg 防盗链策略
 */

import { createEffect, createSignal, on, Show } from 'solid-js';
import type { BookSource } from '@/types';
import {
  loadCoverImageObjectUrl,
  shouldFetchCoverAsBlob,
} from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import { cn } from '@/lib/utils';

export interface ReaderInlineImgProps {
  src: string;
  referer?: string | null;
  source?: BookSource | null;
  class?: string;
  imageStyle?: string;
}

export function ReaderInlineImg(props: ReaderInlineImgProps) {
  const [failed, setFailed] = createSignal(false);
  const [blobSrc, setBlobSrc] = createSignal<string | null>(null);

  const normalizedSrc = () => {
    const raw = props.src?.trim();
    return raw ? normalizeImageUrl(raw) : '';
  };

  const displaySrc = () => {
    const norm = normalizedSrc();
    if (!norm) return undefined;
    if (norm.startsWith('data:')) return norm;
    if (shouldFetchCoverAsBlob(norm)) {
      return blobSrc() ?? undefined;
    }
    return toProxiedImageUrl(norm, {
      referer: props.referer,
      source: props.source,
    }) ?? norm;
  };

  const styleClass = () => {
    const s = props.imageStyle;
    if (s === 'FULL') return 'w-full max-w-full h-auto';
    if (s === 'CENTER') return 'mx-auto block max-w-full h-auto';
    return 'mx-auto block max-w-full h-auto';
  };

  createEffect(
    on(
      () => ({
        norm: normalizedSrc(),
        source: props.source,
        referer: props.referer,
      }),
      (cur, prev) => {
        if (prev && cur.norm === prev.norm && cur.source === prev.source) return;

        setFailed(false);
        setBlobSrc(null);

        const { norm } = cur;
        if (!norm || norm.startsWith('data:') || !shouldFetchCoverAsBlob(norm)) return;

        let cancelled = false;
        void loadCoverImageObjectUrl(norm, {
          referer: props.referer,
          source: cur.source,
        }).then((url) => {
          if (cancelled) return;
          if (url) setBlobSrc(url);
          else setFailed(true);
        });

        return () => {
          cancelled = true;
        };
      },
    ),
  );

  return (
    <Show
      when={displaySrc() && !failed()}
      fallback={
        <div class="flex min-h-[120px] items-center justify-center rounded bg-muted/40 text-xs text-muted-foreground">
          图片加载失败
        </div>
      }
    >
      <img
        src={displaySrc()!}
        alt=""
        class={cn(styleClass(), props.class)}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
