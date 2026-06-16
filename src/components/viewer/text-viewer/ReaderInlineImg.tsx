/**
 * 文本正文插图：行内/块级排版 + 段评点击；加载逻辑见 use-reader-image-load
 */

import { createMemo, Show } from 'solid-js';
import type { BookSource } from '@/types';
import {
  isInlineLegadoImageLayout,
  type LegadoImageLayout,
} from '@/lib/js-engine/legado/legado-image-options';
import {
  resolveInlineTextImageSizeFromSrc,
} from '@/lib/media/image/inline-text-image-size';
import { createReaderImageLoad } from '@/lib/media/image/use-reader-image-load';
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

  /** 首帧即预留占位，避免测量/翻页后 decode 引起行高突变 */
  const inlineSize = createMemo(() => {
    const layout = props.layout;
    if (!layout || !isInlineLegadoImageLayout(layout)) return null;
    const url = props.src?.trim() ?? '';
    if (!url) return null;
    return resolveInlineTextImageSizeFromSrc(url, fontSizePx(), layout);
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

  const reservedBoxStyle = (): Record<string, string> | undefined => {
    const size = inlineSize();
    if (!size || !isInline()) return undefined;
    return {
      width: `${size.width}px`,
      height: `${size.height}px`,
      'min-width': `${size.width}px`,
      'min-height': `${size.height}px`,
    };
  };

  const imgStyle = (): Record<string, string> | undefined => {
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

  const placeholderClass = () =>
    cn(
      'flex flex-col items-center justify-center gap-2 rounded-md bg-muted/30 px-4 text-center text-xs text-muted-foreground',
      isInline() ? 'inline-flex min-h-[1em] min-w-[1em] px-0' : 'min-h-[160px] w-full',
    );

  const wrapperClass = () =>
    cn(
      isInline() ? 'relative inline-flex shrink-0 align-baseline' : 'relative w-full',
      props.class,
    );

  const showLoadingPlaceholder = () =>
    load.phase() === 'loading' && !(isInline() && inlineSize());

  const imgEl = () => (
    <img
      src={load.displaySrc()!}
      alt=""
      class={styleClass()}
      style={imgStyle()}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={load.onImgError}
    />
  );

  return (
    <div
      ref={load.bindContainer}
      class={wrapperClass()}
      style={reservedBoxStyle()}
      data-reader-inline-img={isInline() ? '' : undefined}
    >
      <Show when={showLoadingPlaceholder()}>
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
