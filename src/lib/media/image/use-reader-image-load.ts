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
  shouldFetchReaderInlineImageAsBlob,
} from '@/lib/http/cover-image-loader';
import {
  MANGA_IMAGE_DEFAULT_RETRIES,
  MANGA_IMAGE_FETCH_TIMEOUT_MS,
  MANGA_IMAGE_RETRY_DELAY_MS,
} from '@/lib/media/image/image-fetch-config';
import {
  evictMangaImageMemoryCache,
  loadMangaImageObjectUrl,
  peekMangaImageObjectUrl,
} from '@/lib/media/image/image-loader';
import { isTauri } from '@/lib/platform/detect';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import {
  MANGA_SCROLL_ROOT_ATTR,
  resolveMangaScrollIntersectionRoot,
} from '@/lib/media/image/image-scroll-root';
import {
  clearMangaImageLoadFailure,
  isMangaImageLoadBlocked,
  mangaImageLoadBlockedHint,
} from '@/lib/media/image/image-load-guard';

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
  /** blobSrc 对应的规范化 URL，避免换章/换页时误复用旧 blob */
  const [blobForNorm, setBlobForNorm] = createSignal<string | null>(null);
  const [loadGeneration, setLoadGeneration] = createSignal(0);
  const [statusHint, setStatusHint] = createSignal('');
  const [forceBlobFetch, setForceBlobFetch] = createSignal(false);
  const [inView, setInView] = createSignal(!(input.getDeferUntilVisible?.() ?? false));
  const [containerEl, setContainerEl] = createSignal<HTMLDivElement | undefined>();
  /** 本轮加载失败后暂停自动重试（滚动进出视口不重复拉取/闪占位） */
  const [failedNorm, setFailedNorm] = createSignal<string | null>(null);
  const [readyGeneration, setReadyGeneration] = createSignal(-1);

  const sourceId = () =>
    input.getSource?.()?.sourceUrl ?? input.getSource?.()?.sourceName;

  const failureHint = (norm: string) => {
    const blocked = mangaImageLoadBlockedHint(norm, sourceId());
    if (blocked) return blocked;
    const retries = usesMangaCache()
      ? MANGA_IMAGE_DEFAULT_RETRIES
      : 3;
    return !isTauri() && isCrossOriginCoverUrl(norm)
      ? '跨域图片加载失败（可尝试桌面版 Tauri 或刷新本章）'
      : `加载失败，已自动重试 ${retries} 次`;
  };

  const markLoadFailed = (norm: string) => {
    setFailedNorm(norm);
    setPhase('error');
    setStatusHint(failureHint(norm));
  };

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
    if (usesBlobFetch()) {
      return blobForNorm() === norm ? (blobSrc() ?? undefined) : undefined;
    }
    return directImgSrc();
  };

  const assignBlob = (norm: string, url: string | null) => {
    setBlobSrc(url);
    setBlobForNorm(url ? norm : null);
  };

  const usesMangaCache = () => Boolean(input.getBookUrl?.()?.trim());

  const loadOptions = () => ({
    referer: input.getReferer?.(),
    source: input.getSource?.() ?? null,
    legadoImageHeaders: legadoImage().headers,
    maxRetries: usesMangaCache() ? MANGA_IMAGE_DEFAULT_RETRIES : 3,
    retryDelayMs: usesMangaCache()
      ? MANGA_IMAGE_RETRY_DELAY_MS
      : 900,
    timeoutMs: usesMangaCache() ? MANGA_IMAGE_FETCH_TIMEOUT_MS : 30_000,
    readerInlineQueue: input.getUseFetchQueue?.() ?? false,
    readerInlineQueuePriority: 'high' as const,
    bookUrl: input.getBookUrl?.(),
    chapterIndex: input.getChapterIndex?.(),
    pageIndex: input.getPageIndex?.(),
    persistToDisk: input.getPersistToDisk?.(),
  });

  const retry = () => {
    const norm = normalizedSrc();
    const sid = sourceId();
    if (norm) {
      if (usesMangaCache()) {
        evictMangaImageMemoryCache(norm, input.getSource?.() ?? null);
        clearMangaImageLoadFailure(norm, sid);
      } else {
        evictCoverImageMemoryCache(norm, input.getSource?.() ?? null);
      }
    }
    setFailedNorm(null);
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

    const rootMarginPx = Math.min(
      320,
      Math.max(
        120,
        input.getLazyLoadRootMarginPx?.() ?? 480,
      ),
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
          // 仅控制「是否开始拉取」；已加载成功的图滚出视口后仍保留 blob，避免闪回加载中
          setInView(entry.isIntersecting);
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
        if (!norm) {
          assignBlob('', null);
          setFailedNorm(null);
          setPhase('error');
          setStatusHint('无效图片地址');
          return;
        }

        if (failedNorm() && failedNorm() !== norm) {
          setFailedNorm(null);
        }

        if (cur.defer && !cur.visible) {
          if (failedNorm() === norm) {
            setPhase('error');
            setStatusHint(failureHint(norm));
            return;
          }
          // 已成功加载过：保持 ready + blob，不卸载、不闪占位
          if (phase() === 'ready' && blobForNorm() === norm && (blobSrc() || !usesBlobFetch())) {
            return;
          }
          const peekedWhileHidden = usesMangaCache()
            ? peekMangaImageObjectUrl(norm, loadOptions())
            : null;
          if (peekedWhileHidden) {
            assignBlob(norm, peekedWhileHidden);
            setPhase('ready');
            setReadyGeneration(cur.gen);
            setStatusHint('');
            return;
          }
          setPhase('loading');
          setStatusHint('滚动到此处后加载');
          return;
        }

        if (failedNorm() === norm) {
          setPhase('error');
          setStatusHint(failureHint(norm));
          return;
        }

        if (usesMangaCache() && isMangaImageLoadBlocked(norm, sourceId())) {
          markLoadFailed(norm);
          return;
        }

        setStatusHint('');

        if (norm.startsWith('data:')) {
          assignBlob(norm, norm);
          setPhase('ready');
          setReadyGeneration(cur.gen);
          return;
        }

        if (!usesBlobFetch()) {
          assignBlob(norm, null);
          setPhase('ready');
          setReadyGeneration(cur.gen);
          return;
        }

        // 先命中内存/已有 blob，避免「先清再加载」造成闪烁
        const peeked = usesMangaCache()
          ? peekMangaImageObjectUrl(norm, loadOptions())
          : null;
        if (peeked) {
          assignBlob(norm, peeked);
          setPhase('ready');
          setReadyGeneration(cur.gen);
          setStatusHint('');
          return;
        }
        if (
          blobForNorm() === norm &&
          blobSrc() &&
          phase() === 'ready' &&
          readyGeneration() === cur.gen
        ) {
          setStatusHint('');
          return;
        }

        let cancelled = false;
        setPhase('loading');
        setStatusHint('正在加载图片…');

        const loadPromise = usesMangaCache()
          ? loadMangaImageObjectUrl(input.getSrc()?.trim() ?? norm, loadOptions())
          : loadCoverImageObjectUrl(norm, loadOptions());

        void loadPromise.then((url) => {
          if (cancelled) return;
          if (url) {
            setFailedNorm(null);
            assignBlob(norm, url);
            setPhase('ready');
            setReadyGeneration(cur.gen);
            setStatusHint('');
          } else {
            markLoadFailed(norm);
          }
        });

        return () => {
          cancelled = true;
        };
      },
    ),
  );

  const onImgError = () => {
    if (phase() !== 'ready' || readyGeneration() !== loadGeneration()) return;
    if (input.getDeferUntilVisible?.() && !inView()) return;
    const norm = normalizedSrc();
    if (!norm) return;
    markLoadFailed(norm);
    setStatusHint('图片显示失败，点击重试');
  };

  return {
    phase,
    displaySrc,
    statusHint,
    retry,
    bindContainer,
    onImgError,
    isLoadFailureSuspended: () => failedNorm() !== null,
  };
}
