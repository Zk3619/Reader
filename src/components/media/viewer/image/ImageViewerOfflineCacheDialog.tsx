/**
 * 漫画阅读器离线缓存：章节 HTML + 图片均需完成才计为一章
 */

import { createEffect, createSignal, Show } from 'solid-js';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { OfflineCacheChapterRangeFields } from '@/components/media/viewer/OfflineCacheChapterRangeFields';
import {
  enqueueOfflineCacheRange,
  formatOfflineCacheProgressText,
  getOfflineCacheDownloadProgress,
  isOfflineCacheDownloading,
  offlineCacheDefaultRange,
  parseOfflineCacheChapterRange,
  resolveOfflineCacheChapterTotal,
  stopOfflineCacheForBook,
} from '@/lib/chapter-cache/offline-cache-actions';
import type { Book } from '@/types';

export interface ImageViewerOfflineCacheDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  /** 当前阅读章节索引（0-based） */
  chapterIndex: number;
  /** 目录章数，优先于 book.totalChapterNum */
  catalogSize: number;
}

export function ImageViewerOfflineCacheDialog(
  props: ImageViewerOfflineCacheDialogProps,
) {
  const total = () => resolveOfflineCacheChapterTotal(props.book, props.catalogSize);
  const defaultRange = () =>
    offlineCacheDefaultRange(props.chapterIndex, total());

  const [startChapter, setStartChapter] = createSignal('1');
  const [endChapter, setEndChapter] = createSignal('1');

  const bookUrl = () => props.book?.bookUrl ?? '';
  const isDownloading = () => isOfflineCacheDownloading(bookUrl());
  const progress = () => getOfflineCacheDownloadProgress(bookUrl());

  createEffect(() => {
    if (!props.open) return;
    const range = defaultRange();
    setStartChapter(String(range.start));
    setEndChapter(String(range.end));
  });

  const handleStart = () => {
    const url = bookUrl();
    if (!url) return;
    const range = parseOfflineCacheChapterRange({
      startRaw: startChapter(),
      endRaw: endChapter(),
      max: total(),
      defaultStart: defaultRange().start,
    });
    if (!range) return;
    enqueueOfflineCacheRange(url, range);
    showAppToast({
      title: '已开始离线缓存',
      description: (
        <>
          <p>{`第 ${range.start}–${range.end} 章（共 ${range.end - range.start + 1} 章）`}</p>
          <p>漫画章将等待 HTML 与图片均缓存完成后才计为一章</p>
          <p>可点击缓存按钮查看缓存进度或中断缓存</p>
        </>
      ),
    });
    props.onOpenChange(false);
  };

  const handleStop = () => {
    const url = bookUrl();
    if (!url) return;
    stopOfflineCacheForBook(url);
    showAppToast({ title: '已停止本书缓存任务' });
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <ViewerAppDialogContent layout="plain" class="max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>离线缓存</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            将章节正文与漫画图片下载到本地，无网络时也可阅读。漫画章需 HTML
            与图片均完成才计为一章。此处缓存归用户管理，不受自动清理策略影响；与阅读时的自动预取相互独立。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <OfflineCacheChapterRangeFields
          total={total()}
          startChapter={startChapter()}
          endChapter={endChapter()}
          onStartChapterChange={setStartChapter}
          onEndChapterChange={setEndChapter}
          hint={`共 ${total()} 章；默认从当前阅读章节缓存到末章。每章需 HTML 与图片均完成。`}
        />

        <Show when={isDownloading() && progress()}>
          {(p) => (
            <p class="px-6 pb-2 text-xs text-primary">
              {formatOfflineCacheProgressText(
                p().done,
                p().total,
                p().currentIndex,
                { suffix: '（含图片）' },
              )}
            </p>
          )}
        </Show>

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
