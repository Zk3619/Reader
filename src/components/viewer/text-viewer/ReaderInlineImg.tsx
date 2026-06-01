/**
 * 正文插图：跨域 fetch → blob / Web 代理，对齐 BookCoverImg 防盗链策略
 * 加载态 / 自动重试 / 点击重试 / 视口懒加载 / 批量重试
 */

import {
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { BookSource } from '@/types';
import {
  evictCoverImageMemoryCache,
  loadCoverImageObjectUrl,
  READER_INLINE_IMAGE_DEFAULT_RETRIES,
  READER_INLINE_IMAGE_RETRY_DELAY_MS,
  shouldFetchReaderInlineImageAsBlob,
} from '@/lib/http/cover-image-loader';
import { isCrossOriginCoverUrl } from '@/lib/http/cover-image-loader';
import { isTauri } from '@/lib/platform/detect';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import {
  isInlineLegadoImageLayout,
  type LegadoImageLayout,
} from '@/lib/js-engine/legado/legado-image-options';
import {
  computeInlineTextImageSize,
  parseSvgDataUrlIntrinsicSize,
} from '@/lib/media/image/inline-text-image-size';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import { LoaderIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

/** 漫画滚动区 data 属性，供 IntersectionObserver root */
export const MANGA_SCROLL_ROOT_ATTR = 'data-manga-scroll';

export interface ReaderInlineImgProps {
  src: string;
  referer?: string | null;
  source?: BookSource | null;
  /** 已由 HTML 解析出的 Legado 图请求头（优先于 src 内嵌后缀） */
  legadoImageHeaders?: Record<string, string>;
  /** Legado 单图 click/js（如 showCmt） */
  legadoClick?: string;
  /** 合成后的 Legado 排版 */
  layout?: LegadoImageLayout;
  /** 段评 SVG 点击：打开 Legado 段评页（InnerWeb） */
  onLegadoCommentClick?: (click: string) => void;
  /** 正文字号（px），TEXT 行内图按此对齐较长边 */
  fontSizePx?: number;
  class?: string;
  imageStyle?: string;
  /** 进入视口后再发起网络拉取（漫画长章） */
  deferUntilVisible?: boolean;
  /** IntersectionObserver 的 root 选择器，默认 `[data-manga-scroll]` */
  scrollRootSelector?: string;
  /** 经全局插图并发池拉取（对齐 Legado 预下载并发） */
  useFetchQueue?: boolean;
  /** 父级「重试失败图片」时递增，仅 error 态会重试 */
  batchRetryToken?: number;
}

type LoadPhase = 'loading' | 'ready' | 'error';

export function ReaderInlineImg(props: ReaderInlineImgProps) {
  const [phase, setPhase] = createSignal<LoadPhase>('loading');
  const [blobSrc, setBlobSrc] = createSignal<string | null>(null);
  /** 递增以触发重新拉取（含用户手动重试） */
  const [loadGeneration, setLoadGeneration] = createSignal(0);
  const [statusHint, setStatusHint] = createSignal('');
  /** 直连 img 失败时改走 blob + 重试链路 */
  const [forceBlobFetch, setForceBlobFetch] = createSignal(false);
  const [inView, setInView] = createSignal(!props.deferUntilVisible);
  const [inlineSize, setInlineSize] = createSignal<{ width: number; height: number } | null>(
    null,
  );

  let containerEl: HTMLDivElement | undefined;

  onMount(() => {
    if (!props.deferUntilVisible || !containerEl) return;

    const root =
      (props.scrollRootSelector
        ? document.querySelector(props.scrollRootSelector)
        : containerEl.closest(`[${MANGA_SCROLL_ROOT_ATTR}]`)) ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: '480px 0px',
        threshold: 0,
      },
    );
    observer.observe(containerEl);
    onCleanup(() => observer.disconnect());
  });

  const legadoImage = () => {
    const parsed = parseLegadoUrlWithOptions(props.src?.trim() ?? '');
    const headers = props.legadoImageHeaders ?? parsed.headers;
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
    const proxiedOpts = {
      referer: props.referer,
      source: props.source,
      legadoImageHeaders: legadoImage().headers,
    };
    return toProxiedImageUrl(norm, proxiedOpts) ?? norm;
  };

  const displaySrc = () => {
    const norm = normalizedSrc();
    if (!norm) return undefined;
    if (norm.startsWith('data:')) return norm;
    if (usesBlobFetch()) return blobSrc() ?? undefined;
    return directImgSrc();
  };

  const isInline = () =>
    props.layout != null
      ? isInlineLegadoImageLayout(props.layout)
      : false;

  const fontSizePx = () => Math.max(12, props.fontSizePx ?? 18);

  const updateInlineSizeFromIntrinsic = (w: number, h: number) => {
    const layout = props.layout;
    if (!layout || !isInlineLegadoImageLayout(layout)) return;
    setInlineSize(computeInlineTextImageSize({ width: w, height: h }, fontSizePx(), layout));
  };

  createEffect(() => {
    if (!isInline()) {
      setInlineSize(null);
      return;
    }
    const norm = normalizedSrc();
    const layout = props.layout;
    if (!norm || !layout) return;
    const parsed = parseSvgDataUrlIntrinsicSize(norm);
    if (parsed) {
      updateInlineSizeFromIntrinsic(parsed.width, parsed.height);
    }
  });

  const styleClass = () => {
    const layout = props.layout;
    if (layout === 'TEXT' || layout === 'TEXT_WIDE') {
      return 'inline-block align-text-bottom object-contain max-w-none';
    }
    const s = props.imageStyle ?? layout;
    if (s === 'FULL') return 'w-full max-w-full h-auto';
    if (s === 'SINGLE') {
      return 'mx-auto block max-w-full max-h-[80vh] w-auto h-auto object-contain';
    }
    return 'mx-auto block max-w-full h-auto';
  };

  const inlineStyle = (): Record<string, string> | undefined => {
    const size = inlineSize();
    if (!size || !isInline()) return undefined;
    return {
      width: `${size.width}px`,
      height: `${size.height}px`,
    };
  };

  const handleLegadoClick = (e: MouseEvent) => {
    const click = props.legadoClick;
    if (!click) return;
    e.stopPropagation();
    e.preventDefault();
    console.log('[ReaderInlineImg] legado click', {
      click: click.slice(0, 200),
      layout: props.layout,
      src: props.src?.slice(0, 80),
    });
    props.onLegadoCommentClick?.(click);
  };

  const handleImgLoad = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    if (!isInline() || !props.layout) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w > 0 && h > 0) {
      updateInlineSizeFromIntrinsic(w, h);
    }
  };

  const loadOptions = () => ({
    referer: props.referer,
    source: props.source,
    legadoImageHeaders: legadoImage().headers,
    maxRetries: READER_INLINE_IMAGE_DEFAULT_RETRIES,
    retryDelayMs: READER_INLINE_IMAGE_RETRY_DELAY_MS,
    timeoutMs: 30_000,
    readerInlineQueue: props.useFetchQueue ?? false,
  });

  const retry = () => {
    const norm = normalizedSrc();
    if (norm) {
      evictCoverImageMemoryCache(norm, props.source);
    }
    setForceBlobFetch(true);
    setLoadGeneration((g) => g + 1);
  };

  createEffect(
    on(
      () => props.batchRetryToken ?? 0,
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
        source: props.source,
        referer: props.referer,
        legadoHeaders: legadoImage().headers,
        gen: loadGeneration(),
        forceBlob: forceBlobFetch(),
        visible: inView(),
        defer: props.deferUntilVisible,
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

        void loadCoverImageObjectUrl(norm, loadOptions()).then((url) => {
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

  const handleImgError = () => {
    setPhase('error');
    setStatusHint('图片显示失败，点击重试');
  };

  /** 占位区勿合并 props.class（含 block 会覆盖 flex，导致加载图标不居中） */
  const placeholderClass = () =>
    cn(
      'flex flex-col items-center justify-center gap-2 rounded-md bg-muted/30 px-4 text-center text-xs text-muted-foreground',
      isInline() ? 'inline-flex min-h-[1em] min-w-[1em] px-0' : 'min-h-[160px] w-full',
    );

  const wrapperClass = () =>
    cn(
      isInline() ? 'relative inline-flex align-baseline' : 'relative w-full',
      props.class,
    );

  const imgEl = () => (
    <img
      src={displaySrc()!}
      alt=""
      class={styleClass()}
      style={inlineStyle()}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={handleImgLoad}
      onError={handleImgError}
    />
  );

  return (
    <div ref={containerEl} class={wrapperClass()}>
      <Show when={phase() === 'loading'}>
        <div class={placeholderClass()} aria-busy="true" aria-live="polite">
          <Show when={!isInline() && statusHint() !== '滚动到此处后加载'}>
            <LoaderIcon class="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />
          </Show>
          <Show when={!isInline()}>
            <span class="max-w-full">{statusHint() || '正在加载图片…'}</span>
          </Show>
        </div>
      </Show>

      <Show when={phase() === 'error'}>
        <button
          type="button"
          class={cn(
            placeholderClass(),
            'cursor-pointer border border-dashed border-muted-foreground/40',
            'transition-colors hover:bg-muted/50 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          onClick={(e) => {
            e.stopPropagation();
            retry();
          }}
          aria-label="图片加载失败，点击重试"
        >
          <Show when={!isInline()}>
            <span class="text-sm text-muted-foreground">图片加载失败</span>
            <span class="text-[11px] opacity-80">
              {statusHint() || '点击重试'}
            </span>
          </Show>
        </button>
      </Show>

      <Show when={phase() === 'ready' && displaySrc()}>
        <Show
          when={props.legadoClick && isInline()}
          fallback={imgEl()}
        >
          <button
            type="button"
            class="reader-legado-cmt-img inline-flex shrink-0 cursor-pointer border-0 bg-transparent p-0 align-baseline no-drag"
            data-legado-cmt="true"
            aria-label="查看段评"
            onClick={handleLegadoClick}
          >
            {imgEl()}
          </button>
        </Show>
      </Show>
    </div>
  );
}

