/**
 * 封面大图预览（书籍 / 音乐等模块共用）
 * - 淡入淡出；跟随主程序「减少动画」
 * - 封面宽高严格小于程序视口
 */

import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { getSource } from '@/lib/database/sources';
import {
  loadCoverImageObjectUrl,
  shouldFetchCoverAsBlob,
} from '@/lib/http/cover-image-loader';
import { XIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import type { BookSource } from '@/types';
import { settingsStore } from '@/stores/settings';
import {
  OVERLAY_STACK_FADE_DURATION_MS,
  coverPreviewMaxBounds,
} from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

function resolveCoverBackgroundUrl(
  coverUrl: string | undefined,
  blobUrl: string | null,
): string | undefined {
  const raw = coverUrl?.trim();
  if (!raw) return undefined;
  if (blobUrl) return blobUrl;
  if (!shouldFetchCoverAsBlob(raw)) return raw;
  return undefined;
}

export interface BookCoverPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverUrl?: string | null;
  customCoverUrl?: string | null;
  bookUrl: string;
  origin?: string;
  /** 已加载的书源，避免重复请求；聚合书源封面必需 */
  source?: BookSource | null;
  name: string;
}

export function BookCoverPreviewDialog(props: BookCoverPreviewDialogProps) {
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);
  const [coverBlobUrl, setCoverBlobUrl] = createSignal<string | null>(null);
  /** 含退场动画期间仍挂载 Portal */
  const [mounted, setMounted] = createSignal(props.open);
  /** 驱动 opacity 淡入淡出 */
  const [visible, setVisible] = createSignal(props.open);

  let enterRaf = 0;
  let exitTimer: number | undefined;

  const reduceMotion = () => settingsStore.state.app.reduceMotion === true;

  const displayCoverUrl = () => props.customCoverUrl?.trim() || props.coverUrl?.trim() || '';

  const previewSrc = () => resolveCoverBackgroundUrl(displayCoverUrl(), coverBlobUrl());

  createEffect(() => {
    const open = props.open;
    const reduce = reduceMotion();

    if (enterRaf) {
      cancelAnimationFrame(enterRaf);
      enterRaf = 0;
    }
    if (exitTimer != null) {
      window.clearTimeout(exitTimer);
      exitTimer = undefined;
    }

    if (open) {
      setMounted(true);
      if (reduce) {
        setVisible(true);
        return;
      }
      // 先落到 opacity:0，再双 rAF 触发入场，保证过渡可重播
      setVisible(false);
      enterRaf = requestAnimationFrame(() => {
        enterRaf = requestAnimationFrame(() => {
          enterRaf = 0;
          if (props.open) setVisible(true);
        });
      });
      return;
    }

    setVisible(false);
    if (reduce || !mounted()) {
      setMounted(false);
      return;
    }
    exitTimer = window.setTimeout(() => {
      exitTimer = undefined;
      setMounted(false);
    }, OVERLAY_STACK_FADE_DURATION_MS);
  });

  onCleanup(() => {
    if (enterRaf) cancelAnimationFrame(enterRaf);
    if (exitTimer != null) window.clearTimeout(exitTimer);
  });

  createEffect(() => {
    if (!mounted()) {
      setBookSource(null);
      return;
    }
    if (props.source) {
      setBookSource(props.source);
      return;
    }
    const origin = props.origin?.trim();
    if (!origin) {
      setBookSource(null);
      return;
    }
    void getSource(origin).then(setBookSource);
  });

  createEffect(() => {
    if (!mounted()) {
      setCoverBlobUrl(null);
      return;
    }
    const url = displayCoverUrl();
    if (!url || !shouldFetchCoverAsBlob(url)) {
      setCoverBlobUrl(null);
      return;
    }
    const origin = props.origin;
    if (!bookSource() && origin && !/^https?:\/\//i.test(origin)) {
      return;
    }

    let cancelled = false;
    void loadCoverImageObjectUrl(url, {
      referer: origin,
      source: bookSource() ?? undefined,
      bookUrl: props.bookUrl,
    }).then((blob) => {
      if (!cancelled) setCoverBlobUrl(blob);
    });

    return () => {
      cancelled = true;
    };
  });

  createEffect(() => {
    const blob = coverBlobUrl();
    return () => {
      if (blob) URL.revokeObjectURL(blob);
    };
  });

  const close = () => props.onOpenChange(false);

  return (
    <Show when={mounted()}>
      <Portal>
        {/* 须高于播放详情独立层 z-110，且 Portal 到 body 避免被 overflow/transform 裁切 */}
        <div
          class={cn(
            'fixed inset-0 z-200 flex items-center justify-center bg-background/80 backdrop-blur-sm',
            !reduceMotion() && 'app-overlay-fade-shell',
          )}
          data-overlay-visible={visible() ? 'true' : undefined}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`${props.name} 封面预览`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              close();
            }}
            class="absolute top-[max(0.75rem,env(safe-area-inset-top,0px))] right-3 z-10"
            aria-label="关闭"
          >
            <XIcon class="h-5 w-5" size={20} />
          </Button>
          <div
            class={cn(
              'relative overflow-hidden rounded-lg border border-border/60 bg-card shadow-2xl',
              coverPreviewMaxBounds,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Show
              when={previewSrc()}
              fallback={
                <div class="flex h-48 w-64 items-center justify-center text-sm text-muted-foreground">
                  加载封面…
                </div>
              }
            >
              {(src) => (
                <img
                  src={src()}
                  alt={props.name}
                  class={cn('h-auto w-auto object-contain', coverPreviewMaxBounds)}
                />
              )}
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export { BookCoverPreviewButton } from '@/components/media/reader/books/BookCoverPreviewButton';
