/**
 * 封面大图预览（与书籍信息页一致）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { getSource } from '@/lib/database/sources';
import {
  loadCoverImageObjectUrl,
  shouldFetchCoverAsBlob,
} from '@/lib/http/cover-image-loader';
import { XIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import type { BookSource } from '@/types';

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

  const displayCoverUrl = () => props.customCoverUrl?.trim() || props.coverUrl?.trim() || '';

  const previewSrc = () => resolveCoverBackgroundUrl(displayCoverUrl(), coverBlobUrl());

  createEffect(() => {
    if (!props.open) {
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
    if (!props.open) {
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

  return (
    <Show when={props.open}>
      <Portal>
        {/* 须高于播放详情独立层 z-110，且 Portal 到 body 避免被 overflow/transform 裁切 */}
        <div
          class="fixed inset-0 z-200 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={() => props.onOpenChange(false)}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              props.onOpenChange(false);
            }}
            class="absolute top-[max(0.75rem,env(safe-area-inset-top,0px))] right-3 z-10"
            aria-label="关闭"
          >
            <XIcon class="h-5 w-5" size={20} />
          </Button>
          <div
            class="relative max-w-lg max-h-[80dvh] rounded-lg overflow-hidden border border-border/60 bg-card shadow-2xl"
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
                  class="max-w-full max-h-[80dvh] object-contain"
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
