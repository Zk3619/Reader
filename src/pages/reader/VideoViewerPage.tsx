/**
 * 视频阅读
 * 对齐 Legado VideoPlayerActivity
 */

import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { mediaReaderStore } from '@/stores/media-reader';
import { MediaReaderShell } from '@/components/reader/MediaReaderShell';
import { MediaReaderCatalog } from '@/components/reader/MediaReaderCatalog';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';

export interface VideoViewerPageProps {
  onClose: () => void;
}

export function VideoViewerPage(props: VideoViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);

  let videoEl: HTMLVideoElement | undefined;

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const url = () => mediaReaderStore.state.primaryUrl;
  const loading = () => mediaReaderStore.state.loading;
  const error = () => mediaReaderStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

  createEffect(() => {
    const src = url();
    if (!videoEl || !src) return;
    videoEl.src = src;
    const saved = mediaReaderStore.state.chapterPos;
    if (saved > 0 && saved < 86400) {
      videoEl.currentTime = saved;
    }
    void videoEl.play().catch(() => undefined);
  });

  onCleanup(() => {
    if (videoEl) {
      mediaReaderStore.setChapterPos(videoEl.currentTime);
      void mediaReaderStore.saveProgress();
      videoEl.pause();
    }
  });

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    if (videoEl) mediaReaderStore.setChapterPos(videoEl.currentTime);
    await mediaReaderStore.loadChapter(next);
  };

  return (
    <>
      <MediaReaderShell
        title={book()?.name ?? ''}
        subtitle={chapterTitle()}
        onClose={props.onClose}
        onOpenCatalog={() => setCatalogOpen(true)}
        onRefresh={() => void mediaReaderStore.refreshChapter()}
        loading={loading()}
        footer={
          <div class="flex items-center justify-center gap-3 px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() <= 0 || loading()}
              onClick={() => void goChapter(-1)}
            >
              上一章
            </Button>
            <span class="text-xs text-muted-foreground">
              {catalog().length > 0 ? `${chapterIndex() + 1} / ${catalog().length}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() >= catalog().length - 1 || loading()}
              onClick={() => void goChapter(1)}
            >
              下一章
            </Button>
          </div>
        }
      >
        <div class="flex h-full items-center justify-center bg-black">
          <Show when={loading()}>
            <p class="text-sm text-white/70">加载中…</p>
          </Show>
          <Show when={!loading() && error()}>
            <div class="px-6 text-center">
              <p class="text-sm text-red-400">{error()}</p>
              <Button
                class="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void mediaReaderStore.refreshChapter()}
              >
                重试
              </Button>
            </div>
          </Show>
          <Show when={!loading() && url()}>
            <video
              ref={videoEl}
              class="max-h-full max-w-full"
              controls
              playsinline
              onTimeUpdate={() => {
                if (videoEl) mediaReaderStore.setChapterPos(videoEl.currentTime);
              }}
              onEnded={() => void goChapter(1)}
            />
          </Show>
        </div>
      </MediaReaderShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaReaderCatalog
              open={catalogOpen()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void mediaReaderStore.loadChapter(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </>
  );
}

/** @deprecated 使用 VideoViewerPage */
export const VideoPlayerPage = VideoViewerPage;
