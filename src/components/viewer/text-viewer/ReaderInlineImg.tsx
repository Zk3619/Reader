/**
 * 文本正文插图：行内/块级排版 + 段评点击；加载逻辑见 use-reader-image-load
 */

import { createEffect, createSignal, Show } from 'solid-js';
import type { BookSource } from '@/types';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import {
  isInlineLegadoImageLayout,
  type LegadoImageLayout,
} from '@/lib/js-engine/legado/legado-image-options';
import {
  computeInlineTextImageSize,
  parseSvgDataUrlIntrinsicSize,
} from '@/lib/media/image/inline-text-image-size';
import { createReaderImageLoad } from '@/lib/media/image/use-reader-image-load';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { LoaderIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface ReaderInlineImgProps {
  src: string;
  referer?: string | null;
  source?: BookSource | null;
  legadoImageHeaders?: Record<string, string>;
  legadoClick?: string;
  layout?: LegadoImageLayout;
  onLegadoCommentClick?: (click: string) => void;
  fontSizePx?: number;
  class?: string;
  imageStyle?: string;
  /** 漫画章：走专用磁盘+内存缓存 */
  bookUrl?: string | null;
  chapterIndex?: number;
  pageIndex?: number;
}

export function ReaderInlineImg(props: ReaderInlineImgProps) {
  const [inlineSize, setInlineSize] = createSignal<{ width: number; height: number } | null>(
    null,
  );

  const load = createReaderImageLoad({
    getSrc: () => props.src,
    getReferer: () => props.referer,
    getSource: () => props.source ?? null,
    getLegadoImageHeaders: () => props.legadoImageHeaders,
    getBookUrl: () => props.bookUrl,
    getChapterIndex: () => props.chapterIndex,
    getPageIndex: () => props.pageIndex,
  });

  const isInline = () =>
    props.layout != null ? isInlineLegadoImageLayout(props.layout) : false;

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
    const url = props.src?.trim() ?? '';
    const layout = props.layout;
    if (!url || !layout) return;
    const norm = normalizeImageUrl(parseLegadoUrlWithOptions(url).url.trim());
    if (!norm) return;
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
      src={load.displaySrc()!}
      alt=""
      class={styleClass()}
      style={inlineStyle()}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={handleImgLoad}
      onError={load.onImgError}
    />
  );

  return (
    <div ref={load.bindContainer} class={wrapperClass()}>
      <Show when={load.phase() === 'loading'}>
        <div class={placeholderClass()} aria-busy="true" aria-live="polite">
          <Show when={!isInline()}>
            <LoaderIcon class="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />
            <span class="max-w-full">{load.statusHint() || '正在加载图片…'}</span>
          </Show>
        </div>
      </Show>

      <Show when={load.phase() === 'error'}>
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
            load.retry();
          }}
          aria-label="图片加载失败，点击重试"
        >
          <Show when={!isInline()}>
            <span class="text-sm text-muted-foreground">图片加载失败</span>
            <span class="text-[11px] opacity-80">{load.statusHint() || '点击重试'}</span>
          </Show>
        </button>
      </Show>

      <Show when={load.phase() === 'ready' && load.displaySrc()}>
        <Show when={props.legadoClick && isInline()} fallback={imgEl()}>
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
