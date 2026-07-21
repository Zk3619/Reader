/**
 * PDF 阅读（本地书籍）
 * P1 最小实现：不接入 viewerStore/textViewerStore，直接读取本地文件生成 blob URL 交给浏览器原生渲染。
 */

import { createEffect, createSignal, onCleanup, Show, type Accessor } from 'solid-js';
import {
  MediaViewerShell,
  MediaViewerShellMain,
} from '@/components/media/viewer/MediaViewerShell';
import { MediaViewerHeader } from '@/components/media/viewer/MediaViewerHeader';
import { MediaViewerFooter } from '@/components/media/viewer/MediaViewerFooter';
import { MediaViewerChromeSlots } from '@/components/media/viewer/MediaViewerChromeSlots';
import { MediaViewerToolbarHeader } from '@/components/media/viewer/MediaViewerToolbarHeader';
import { useMediaViewerMainStageClass, mediaViewerMobileContentOverflowClass } from '@/lib/viewer/viewer-chrome-layout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getBook } from '@/lib/database/books';
import { readLocalBookContent } from '@/lib/local-book';
import { PDF_FULL_CHAPTER_TITLE } from '@/lib/local-book/pdf-book';
import type { Book } from '@/types';

export interface PdfViewerPageProps {
  /** 本地 PDF 书籍地址（书架 bookUrl） */
  bookUrl: string;
  onClose: () => void;
  onOpenBookInfo?: () => void;
  entryVisible?: Accessor<boolean>;
}

export function PdfViewerPage(props: PdfViewerPageProps) {
  const [book, setBook] = createSignal<Book | null>(null);
  const [blobUrl, setBlobUrl] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const mainStageClass = useMediaViewerMainStageClass(
    cn('flex flex-col bg-muted/30', mediaViewerMobileContentOverflowClass()),
  );

  let currentObjectUrl: string | null = null;
  let loadSeq = 0;

  const revokeCurrentObjectUrl = () => {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  };

  const load = async (bookUrl: string) => {
    const seq = ++loadSeq;
    setLoading(true);
    setError(null);
    try {
      const [loadedBook, content] = await Promise.all([
        getBook(bookUrl),
        readLocalBookContent(bookUrl),
      ]);
      if (seq !== loadSeq) return;
      setBook(loadedBook);
      const blob = new Blob([content], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      revokeCurrentObjectUrl();
      currentObjectUrl = url;
      setBlobUrl(url);
    } catch (e) {
      if (seq !== loadSeq) return;
      console.error('[pdf-viewer] 加载 PDF 失败:', e);
      setError(e instanceof Error ? e.message : '加载失败');
      setBlobUrl(null);
    } finally {
      if (seq === loadSeq) setLoading(false);
    }
  };

  createEffect(() => {
    void load(props.bookUrl);
  });

  onCleanup(() => {
    revokeCurrentObjectUrl();
  });

  return (
    <MediaViewerShell themeTarget="viewer.file" entryVisible={props.entryVisible}>
      <MediaViewerShellMain>
        <MediaViewerChromeSlots
          header={
            <MediaViewerHeader>
              <MediaViewerToolbarHeader
                title={book()?.name ?? ''}
                subtitle={PDF_FULL_CHAPTER_TITLE}
                onClose={props.onClose}
                onOpenBookInfo={props.onOpenBookInfo}
                onRefresh={() => void load(props.bookUrl)}
                loading={loading()}
              />
            </MediaViewerHeader>
          }
          footer={
            <MediaViewerFooter>
              <div class="flex items-center justify-center px-4 py-2 text-xs text-muted-foreground">
                PDF · {PDF_FULL_CHAPTER_TITLE}
              </div>
            </MediaViewerFooter>
          }
        >
          <div class={mainStageClass()}>
            <Show when={loading()}>
              <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                加载中…
              </div>
            </Show>
            <Show when={!loading() && error()}>
              <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p class="text-sm text-muted-foreground">{error()}</p>
                <Button size="sm" variant="outline" onClick={() => void load(props.bookUrl)}>
                  重试
                </Button>
              </div>
            </Show>
            <Show when={!loading() && !error() && blobUrl()}>
              {(url) => (
                <iframe
                  title={book()?.name ?? 'PDF'}
                  src={url()}
                  class="min-h-0 flex-1 w-full border-0"
                />
              )}
            </Show>
          </div>
        </MediaViewerChromeSlots>
      </MediaViewerShellMain>
    </MediaViewerShell>
  );
}
