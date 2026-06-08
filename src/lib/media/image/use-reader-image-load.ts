/**
 * 阅读器插图共享加载：Legado URL、blob/代理、重试、视口懒加载、并发池
 * 供文本正文插图（ReaderInlineImg）与漫画页（MangaPageImg）复用
 */

import { createEffect, createSignal, on, onCleanup } from 'solid-js';
import type { BookSource } from '@/types';
import {
  evictCoverImageMemoryCache,
  isCrossOriginCoverUrl,
  loadCoverImageObjectUrl,
  READER_INLINE_IMAGE_DEFAULT_RETRIES,
  READER_INLINE_IMAGE_RETRY_DELAY_MS,
  shouldFetchReaderInlineImageAsBlob,
} from '@/lib/http/cover-image-loader';
import {
  evictMangaImageMemoryCache,
  loadMangaImageObjectUrl,
  peekMangaImageObjectUrl,
} from '@/lib/media/image/manga-image-loader';
import { isTauri } from '@/lib/platform/detect';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import {
  MANGA_SCROLL_ROOT_ATTR,
  resolveMangaScrollIntersectionRoot,
} from '@/lib/media/image/manga-scroll-root';

export type ReaderImageLoadPhase = 'loading' | 'ready' | 'error';

export interface ReaderImageLoadInput {
  getSrc: () => string;
  getReferer?: () => string | null | undefined;
  getSource?: () => BookSource | null | undefined;
  getLegadoImageHeaders?: () => Record<string, string> | undefined;
  getDeferUntilVisible?: () => boolean | undefined;
  getScrollRootSelector?: () => string | undefined;
  /** 懒加载时用于 closest 查找滚动根，默认漫画滚动区 */
  getScrollRootAttr?: () => string | undefined;
  getUseFetchQueue?: () => boolean | undefined;
  getBatchRetryToken?: () => number | undefined;
  /** 懒加载 IO rootMargin（px），漫画滚动可与 mangaPreDownloadNum 联动 */
  getLazyLoadRootMarginPx?: () => number | undefined;
  /** 漫画专用磁盘缓存（与封面分离） */
  getBookUrl?: () => string | null | undefined;
  getChapterIndex?: () => number | undefined;
  getPageIndex?: () => number | undefined;
  /** 阅读时是否写入漫画磁盘缓存 */
  getPersistToDisk?: () => boolean | undefined;
}

export function createReaderImageLoad(input: ReaderImageLoadInput) {
  const [phase, setPhase] = createSignal<ReaderImageLoadPhase>('loading');
  const [blobSrc, setBlobSrc] = createSignal<string | null>(null);
  const [loadGeneration, setLoadGeneration] = createSignal(0);
  const [statusHint, setStatusHint] = createSignal('');
  const [forceBlobFetch, setForceBlobFetch] = createSignal(false);
  const [inView, setInView] = createSignal(!(input.getDeferUntilVisible?.() ?? false));
  const [containerEl, setContainerEl] = createSignal<HTMLDivElement | undefined>();

  const legadoImage = () => {
    const parsed = parseLegadoUrlWithOptions(input.getSrc()?.trim() ?? '');
    const headers = input.getLegadoImageHeaders?.() ?? parsed.headers;
    return headers ? { url: parsed.url, headers } : parsed;
  };

  const normalizedSrc = () => {
    const url = legadoImage().url.trim();
    return url ? normalizeImageUrl(url) : '';
  };

  const usesBlobFetch = () => {
    const norm = normalizedSrc();
    if (!norm || norm.startsWith('data:')) return false;
    return shouldFetchReaderInlineImageAsBlob(norm, {
      legadoImageHeaders: legadoImage().headers,
      forceBlob: forceBlobFetch(),
    });
  };

  const directImgSrc = () => {
    const norm = normalizedSrc();
    if (!norm || norm.startsWith('data:')) return norm || undefined;
    if (usesBlobFetch()) return undefined;
    return (
      toProxiedImageUrl(norm, {
        referer: input.getReferer?.(),
        source: input.getSource?.() ?? null,
        legadoImageHeaders: legadoImage().headers,
      }) ?? norm
    );
  };

  const displaySrc = () => {
    const norm = normalizedSrc();
    if (!norm) return undefined;
    if (norm.startsWith('data:')) return norm;
    if (usesBlobFetch()) return blobSrc() ?? undefined;
    return directImgSrc();
  };

  const usesMangaCache = () => Boolean(input.getBookUrl?.()?.trim());

  const loadOptions = () => ({
    referer: input.getReferer?.(),
    source: input.getSource?.() ?? null,
    legadoImageHeaders: legadoImage().headers,
    maxRetries: READER_INLINE_IMAGE_DEFAULT_RETRIES,
    retryDelayMs: READER_INLINE_IMAGE_RETRY_DELAY_MS,
    timeoutMs: 30_000,
    readerInlineQueue: input.getUseFetchQueue?.() ?? false,
    readerInlineQueuePriority: 'high' as const,
    bookUrl: input.getBookUrl?.(),
    chapterIndex: input.getChapterIndex?.(),
    pageIndex: input.getPageIndex?.(),
    persistToDisk: input.getPersistToDisk?.(),
  });

  const retry = () => {
    const norm = normalizedSrc();
    if (norm) {
      if (usesMangaCache()) {
        evictMangaImageMemoryCache(norm, input.getSource?.() ?? null);
      } else {
        evictCoverImageMemoryCache(norm, input.getSource?.() ?? null);
      }
    }
    setForceBlobFetch(true);
    setLoadGeneration((g) => g + 1);
  };

  const bindContainer = (el: HTMLDivElement) => {
    setContainerEl(el);
  };

  /** ref 在 onMount 之后才赋值，须在 container 就绪后挂观察器 */
  createEffect(() => {
    const el = containerEl();
    if (!input.getDeferUntilVisible?.() || !el) return;

    const rootAttr = input.getScrollRootAttr?.() ?? MANGA_SCROLL_ROOT_ATTR;
    const root = input.getScrollRootSelector?.()
      ? document.querySelector(input.getScrollRootSelector()!)
      : resolveMangaScrollIntersectionRoot(el, rootAttr);

    const rootMarginPx = Math.max(
      160,
      input.getLazyLoadRootMarginPx?.() ?? 480,
    );
    const markInViewIfVisible = () => {
      const elRect = el.getBoundingClientRect();
      if (root instanceof Element) {
        const rootRect = root.getBoundingClientRect();
        if (
          elRect.bottom >= rootRect.top - rootMarginPx &&
          elRect.top <= rootRect.bottom + rootMarginPx
        ) {
          setInView(true);
        }
        return;
      }
      if (elRect.bottom >= -rootMarginPx && elRect.top <= window.innerHeight + rootMarginPx) {
        setInView(true);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            continue;
          }
          if (!input.getDeferUntilVisible?.() || !usesMangaCache()) continue;
          const norm = normalizedSrc();
          if (norm) {
            evictMangaImageMemoryCache(norm, input.getSource?.() ?? null);
          }
          setBlobSrc(null);
          setInView(false);
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: `${rootMarginPx}px 0px`,
        threshold: 0,
      },
    );
    observer.observe(el);
    markInViewIfVisible();
    onCleanup(() => observer.disconnect());
  });

  createEffect(
    on(
      () => input.getBatchRetryToken?.() ?? 0,
      (token, prev) => {
        if (prev === undefined || token === prev || token === 0) return;
        if (phase() === 'error') retry();
      },
    ),
  );

  createEffect(
    on(
      () => ({
        norm: normalizedSrc(),
        source: input.getSource?.() ?? null,
        referer: input.getReferer?.(),
        legadoHeaders: legadoImage().headers,
        gen: loadGeneration(),
        forceBlob: forceBlobFetch(),
        visible: inView(),
        defer: input.getDeferUntilVisible?.() ?? false,
      }),
      (cur) => {
        const { norm } = cur;
        setStatusHint('');

        if (!norm) {
          setBlobSrc(null);
          setPhase('error');
          setStatusHint('无效图片地址');
          return;
        }

        if (cur.defer && !cur.visible) {
          setBlobSrc(null);
          setPhase('loading');
          setStatusHint('滚动到此处后加载');
          return;
        }

        if (norm.startsWith('data:')) {
          setBlobSrc(norm);
          setPhase('ready');
          return;
        }

        if (!usesBlobFetch()) {
          setBlobSrc(null);
          setPhase('ready');
          return;
        }

        let cancelled = false;
        setPhase('loading');
        setBlobSrc(null);
        setStatusHint('正在加载图片…');

        const peeked = usesMangaCache()
          ? peekMangaImageObjectUrl(norm, loadOptions())
          : null;
        if (peeked) {
          setBlobSrc(peeked);
          setPhase('ready');
          setStatusHint('');
          return;
        }

        const loadPromise = usesMangaCache()
          ? loadMangaImageObjectUrl(input.getSrc()?.trim() ?? norm, loadOptions())
          : loadCoverImageObjectUrl(norm, loadOptions());

        void loadPromise.then((url) => {
          if (cancelled) return;
          if (url) {
            setBlobSrc(url);
            setPhase('ready');
            setStatusHint('');
          } else {
            setPhase('error');
            setStatusHint(
              !isTauri() && isCrossOriginCoverUrl(norm)
                ? '跨域图片加载失败（可尝试桌面版 Tauri 或刷新本章）'
                : `加载失败，已自动重试 ${READER_INLINE_IMAGE_DEFAULT_RETRIES} 次`,
            );
          }
        });

        return () => {
          cancelled = true;
        };
      },
    ),
  );

  const onImgError = () => {
    setPhase('error');
    setStatusHint('图片显示失败，点击重试');
  };

  return {
    phase,
    displaySrc,
    statusHint,
    retry,
    bindContainer,
    onImgError,
  };
}
