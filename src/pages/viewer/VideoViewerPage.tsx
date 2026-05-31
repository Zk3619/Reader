/**
 * 视频阅读
 * 对齐 Legado VideoPlayerActivity
 */

import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerChapterNavFooter } from '@/components/viewer/MediaViewerChapterNavFooter';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { showAppToast } from '@/components/shared/AppToasts';

export interface VideoViewerPageProps {
  onClose: () => void;
}

export function VideoViewerPage(props: VideoViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);

  let videoEl: HTMLVideoElement | undefined;

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const url = () => viewerStore.state.primaryUrl;
  const loading = () => viewerStore.state.loading;
  const error = () => viewerStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

  createEffect(() => {
    const src = url();
    if (!videoEl || !src) return;
    videoEl.src = src;
    const saved = viewerStore.state.chapterPos;
    if (saved > 0 && saved < 86400) {
      videoEl.currentTime = saved;
    }
    void videoEl.play().catch(() => undefined);
  });

  onCleanup(() => {
    if (videoEl) {
      viewerStore.setChapterPos(videoEl.currentTime);
      void viewerStore.saveProgress();
      videoEl.pause();
    }
  });

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    if (videoEl) viewerStore.setChapterPos(videoEl.currentTime);
    await viewerStore.loadChapter(next);
  };

  return (
    <>
      <MediaViewerShell>
        <MediaViewerShellMain>
          <div class="absolute inset-0 flex items-center justify-center bg-black">
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
                onClick={() => void viewerStore.refreshChapter()}
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
                if (videoEl) viewerStore.setChapterPos(videoEl.currentTime);
              }}
              onEnded={() => void goChapter(1)}
            />
          </Show>
          </div>

          <MediaViewerHeader placement="overlay">
            <MediaViewerToolbarHeader
              title={book()?.name ?? ''}
              subtitle={chapterTitle()}
              onClose={props.onClose}
              onOpenCatalog={() => setCatalogOpen(true)}
              onRefresh={() => {
                if (!viewerStore.isOpen()) {
                  showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
                  return;
                }
                void viewerStore.refreshChapter();
              }}
              loading={loading()}
            />
          </MediaViewerHeader>

          <MediaViewerFooter placement="overlay">
            <MediaViewerChapterNavFooter
              chapterIndex={chapterIndex()}
              catalogLength={catalog().length}
              loading={loading()}
              onPrev={() => void goChapter(-1)}
              onNext={() => void goChapter(1)}
            />
          </MediaViewerFooter>
        </MediaViewerShellMain>
      </MediaViewerShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaViewerCatalog
              open={catalogOpen()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void viewerStore.loadChapter(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </>
  );
}
