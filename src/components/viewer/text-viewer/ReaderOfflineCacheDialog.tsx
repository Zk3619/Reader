/**
 * 阅读器离线缓存（对齐 Legado BaseReadBookActivity.showDownloadDialog + CacheBook.start）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput, TextFieldLabel } from '@/components/ui/text-field';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  chapterCacheDownloadStore,
  enqueueChapterDownload,
  stopChapterDownload,
} from '@/lib/chapter-cache';
import type { Book } from '@/types';

export interface ReaderOfflineCacheDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  /** 当前阅读章节索引（0-based） */
  chapterIndex: number;
  /** 目录章数，优先于 book.totalChapterNum */
  catalogSize: number;
}

function chapterTotal(book: Book | null, catalogSize: number): number {
  if (catalogSize > 0) return catalogSize;
  const n = book?.totalChapterNum ?? 0;
  return n > 0 ? n : 1;
}

export function ReaderOfflineCacheDialog(props: ReaderOfflineCacheDialogProps) {
  const total = () => chapterTotal(props.book, props.catalogSize);
  const defaultStart = () => Math.min(props.chapterIndex + 1, total());
  const defaultEnd = () => total();

  const [startChapter, setStartChapter] = createSignal('1');
  const [endChapter, setEndChapter] = createSignal('1');

  const bookUrl = () => props.book?.bookUrl ?? '';
  const isDownloading = () =>
    Boolean(bookUrl() && chapterCacheDownloadStore.isBookActive(bookUrl()));
  const progress = () =>
    bookUrl() ? chapterCacheDownloadStore.getProgress(bookUrl()) : undefined;

  createEffect(() => {
    if (!props.open) return;
    setStartChapter(String(defaultStart()));
    setEndChapter(String(defaultEnd()));
  });

  const parseRange = (): { start: number; end: number } | null => {
    const max = total();
    const startRaw = startChapter().trim();
    const endRaw = endChapter().trim();
    const start = startRaw === '' ? defaultStart() : Number.parseInt(startRaw, 10);
    const end = endRaw === '' ? max : Number.parseInt(endRaw, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      showAppToast({ title: '请输入有效章节号', variant: 'warning' });
      return null;
    }
    if (start < 1 || end < 1 || start > max || end > max) {
      showAppToast({
        title: '章节范围无效',
        description: `请在 1–${max} 之间选择`,
        variant: 'warning',
      });
      return null;
    }
    if (start > end) {
      showAppToast({ title: '起始章节不能大于结束章节', variant: 'warning' });
      return null;
    }
    return { start, end };
  };

  const handleStart = () => {
    const url = bookUrl();
    if (!url) return;
    const range = parseRange();
    if (!range) return;
    enqueueChapterDownload(url, range.start - 1, range.end - 1);
    showAppToast({
      title: '已开始离线缓存',
      description: (
        <>
          <p>{`第 ${range.start}–${range.end} 章（共 ${range.end - range.start + 1} 章）`}</p>
          <p>可点击缓存按钮查看缓存进度或中断缓存</p>
        </>
      ),
    });
    props.onOpenChange(false);
  };

  const handleStop = () => {
    const url = bookUrl();
    if (!url) return;
    stopChapterDownload(url);
    showAppToast({ title: '已停止本书缓存任务' });
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <ViewerAppDialogContent layout="plain" class="max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>离线缓存</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            将章节正文下载到本地，无网络时也可阅读。与阅读时的自动预取相互独立。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <div class="space-y-4 px-6 py-2">
          <div class="grid grid-cols-2 gap-3">
            <TextField class="space-y-1.5">
              <TextFieldLabel>起始章节</TextFieldLabel>
              <TextFieldInput
                type="number"
                min={1}
                max={total()}
                value={startChapter()}
                onInput={(e) => setStartChapter(e.currentTarget.value)}
              />
            </TextField>
            <TextField class="space-y-1.5">
              <TextFieldLabel>结束章节</TextFieldLabel>
              <TextFieldInput
                type="number"
                min={1}
                max={total()}
                value={endChapter()}
                onInput={(e) => setEndChapter(e.currentTarget.value)}
              />
            </TextField>
          </div>
          <p class="text-xs text-muted-foreground">
            共 {total()} 章；默认从当前阅读章节缓存到末章（对齐 Legado）。
          </p>
          <Show when={isDownloading() && progress()}>
            {(p) => {
              const cur = p().currentIndex;
              return (
                <p class="text-xs text-primary">
                  正在缓存… {p().done}/{p().total}
                  {cur != null ? `（第 ${cur + 1} 章）` : ''}
                </p>
              );
            }}
          </Show>
        </div>

        <ViewerAppDialogFooter class="gap-2 sm:justify-end">
          <Show when={isDownloading()}>
            <Button type="button" variant="outline" onClick={handleStop}>
              停止
            </Button>
          </Show>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleStart}>
            开始缓存
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}
