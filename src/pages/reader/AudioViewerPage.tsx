/**
 * 音频阅读
 * 对齐 Legado AudioPlayActivity
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
import { Slider, SliderTrack, SliderFill, SliderThumb } from '@/components/ui/slider';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';

export interface AudioViewerPageProps {
  onClose: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioViewerPage(props: AudioViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal(0);

  let audioEl: HTMLAudioElement | undefined;

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const url = () => mediaReaderStore.state.primaryUrl;
  const loading = () => mediaReaderStore.state.loading;
  const error = () => mediaReaderStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

  createEffect(() => {
    const src = url();
    if (!audioEl || !src) return;
    audioEl.src = src;
    const saved = mediaReaderStore.state.chapterPos;
    if (saved > 0 && saved < 36000) {
      audioEl.currentTime = saved;
    }
    void audioEl.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  });

  onCleanup(() => {
    if (audioEl) {
      mediaReaderStore.setChapterPos(audioEl.currentTime);
      void mediaReaderStore.saveProgress();
      audioEl.pause();
    }
  });

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    if (audioEl) mediaReaderStore.setChapterPos(audioEl.currentTime);
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
      >
        <div class="flex h-full flex-col items-center justify-center gap-6 px-6">
          <Show when={book()?.coverUrl || book()?.customCoverUrl}>
            <img
              src={book()?.customCoverUrl || book()?.coverUrl}
              alt=""
              class="h-48 w-36 rounded-lg object-cover shadow-md"
            />
          </Show>

          <Show when={loading()}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>
          <Show when={!loading() && error()}>
            <div class="text-center">
              <p class="text-sm text-destructive">{error()}</p>
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
            <audio
              ref={audioEl}
              class="hidden"
              preload="metadata"
              onTimeUpdate={() => {
                if (!audioEl) return;
                setCurrentTime(audioEl.currentTime);
                mediaReaderStore.setChapterPos(audioEl.currentTime);
              }}
              onLoadedMetadata={() => {
                if (audioEl) setDuration(audioEl.duration);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                void goChapter(1);
              }}
            />
            <div class="flex w-full max-w-md items-center gap-3">
              <span class="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {formatTime(currentTime())}
              </span>
              <Slider
                class="flex-1"
                minValue={0}
                maxValue={Math.max(duration(), 1)}
                step={1}
                value={[currentTime()]}
                onChange={(v) => {
                  const t = v[0] ?? 0;
                  if (audioEl) audioEl.currentTime = t;
                  setCurrentTime(t);
                }}
              >
                <SliderTrack>
                  <SliderFill />
                </SliderTrack>
                <SliderThumb />
              </Slider>
              <span class="w-10 text-xs tabular-nums text-muted-foreground">
                {formatTime(duration())}
              </span>
            </div>
            <div class="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => void goChapter(-1)}>
                上一章
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  if (!audioEl) return;
                  if (playing()) audioEl.pause();
                  else void audioEl.play();
                }}
              >
                {playing() ? '暂停' : '播放'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void goChapter(1)}>
                下一章
              </Button>
            </div>
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

/** @deprecated 使用 AudioViewerPage */
export const AudioPlayerPage = AudioViewerPage;
