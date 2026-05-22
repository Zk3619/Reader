/**
 * 书籍封面：跨域一律 fetch → blob，避免 CDN 403 / CORB。
 */

import { createEffect, createSignal, Show, type JSX } from 'solid-js';
import type { BookSource } from '@/types';
import {
  loadCoverImageObjectUrl,
  shouldFetchCoverAsBlob,
} from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';

export interface BookCoverImgProps {
  src?: string | null;
  referer?: string | null;
  source?: BookSource | null;
  /** 签名封面过期时用于 getBookInfo 刷新 thumb_url */
  bookUrl?: string | null;
  onCoverUrlRefreshed?: (newUrl: string) => void;
  alt?: string;
  class?: string;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  fallback?: JSX.Element;
}

export function BookCoverImg(props: BookCoverImgProps) {
  const [failed, setFailed] = createSignal(false);
  const [blobSrc, setBlobSrc] = createSignal<string | null>(null);

  const normalizedSrc = () => {
    const raw = props.src?.trim();
    return raw ? normalizeImageUrl(raw) : '';
  };

  const loadOptions = () => ({
    referer: props.referer,
    source: props.source,
    bookUrl: props.bookUrl,
    onCoverUrlRefreshed: props.onCoverUrlRefreshed,
  });

  const displaySrc = () => {
    const norm = normalizedSrc();
    if (!norm) return undefined;
    if (shouldFetchCoverAsBlob(norm)) {
      return blobSrc() ?? undefined;
    }
    return norm;
  };

  const ready = () => !!displaySrc() && !failed();

  /** origin 非 http 的书源（如晴天聚合）须等书源对象加载后再请求封面 */
  const needsBookSourceForCover = () => {
    const r = props.referer?.trim();
    return !r || !/^https?:\/\//i.test(r);
  };

  createEffect(() => {
    const norm = normalizedSrc();
    setFailed(false);
    setBlobSrc(null);

    if (!norm || !shouldFetchCoverAsBlob(norm)) return;
    if (needsBookSourceForCover() && !props.source) return;

    let cancelled = false;
    void loadCoverImageObjectUrl(norm, loadOptions()).then((url) => {
      if (cancelled) return;
      if (url) setBlobSrc(url);
      else setFailed(true);
    });

    return () => {
      cancelled = true;
    };
  });

  return (
    <Show when={ready()} fallback={props.fallback}>
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
