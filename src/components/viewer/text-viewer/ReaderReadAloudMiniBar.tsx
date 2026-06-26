/**
 * 浮动朗读控制条（对标 Legado ReadAloudMiniBarController）
 */

import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getReadAloudSessionSnapshot,
  nextReadAloudChapter,
  nextReadAloudParagraph,
  prevReadAloudChapter,
  prevReadAloudParagraph,
  stopReadAloudSession,
  subscribeReadAloudSession,
  toggleReadAloudSessionPlay,
  type ReadAloudSessionSnapshot,
} from '@/lib/media/text/read-aloud-session';
import { subscribeReadAloudProgress } from '@/lib/media/text/read-aloud-progress';
import { globalMediaPlayerState } from '@/stores/global-media-player';
import { textViewerStore } from '@/stores/viewer';

export interface ReaderReadAloudMiniBarProps {
  drawerOpen: boolean;
  onOpenDrawer: () => void;
}

export function ReaderReadAloudMiniBar(props: ReaderReadAloudMiniBarProps) {
  const [snapshot, setSnapshot] = createSignal<ReadAloudSessionSnapshot>(
    getReadAloudSessionSnapshot(),
  );
  const [liveParagraphText, setLiveParagraphText] = createSignal('');

  onMount(() => {
    const unsubSession = subscribeReadAloudSession((s) => {
      setSnapshot(s);
      if (s.currentParagraphPreview) setLiveParagraphText(s.currentParagraphPreview);
    });
    const unsubProgress = subscribeReadAloudProgress((p) => {
      if (p?.paragraphText) setLiveParagraphText(p.paragraphText);
    });
    onCleanup(() => {
      unsubSession();
      unsubProgress();
    });
  });

  const visible = () => {
    const s = snapshot().state;
    const active = s === 'playing' || s === 'paused';
    if (!active) return false;
    if (globalMediaPlayerState.shellActive) return false;
    return !props.drawerOpen;
  };

  const metaLine = createMemo(() => {
    const book = textViewerStore.state.book;
    const chapter =
      textViewerStore.state.catalog[textViewerStore.state.chapterIndex]?.title ?? '';
    const parts = [book?.name, book?.author, chapter].filter(Boolean);
    return parts.join(' · ') || '朗读中';
  });

  const readingText = createMemo(() => {
    const live = liveParagraphText().trim();
    if (live) return live;
    return snapshot().currentParagraphPreview.trim();
  });

  const isPlaying = () => snapshot().state === 'playing';

  return (
    <Show when={visible()}>
      <div
        class={cn(
          'pointer-events-auto fixed bottom-20 left-1/2 z-(--viewer-chrome-z,50)',
          'w-[min(92vw,32rem)] -translate-x-1/2',
          'rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm',
        )}
        role="toolbar"
        aria-label="朗读控制"
      >
        <button
          type="button"
          class="mb-2 w-full truncate text-left text-xs text-muted-foreground"
          onClick={props.onOpenDrawer}
        >
          {metaLine()}
        </button>

        <button
          type="button"
          class="mb-3 max-h-20 w-full overflow-y-auto text-left text-sm leading-relaxed text-foreground/90"
          onClick={props.onOpenDrawer}
        >
          {readingText() || '…'}
        </button>

        <div class="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs"
            onClick={() => void prevReadAloudChapter()}
          >
            上一章
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0"
            aria-label="上一段"
            onClick={() => void prevReadAloudParagraph()}
          >
            <SkipBack class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-9 w-9 shrink-0"
            aria-label={isPlaying() ? '暂停' : '播放'}
            onClick={() => toggleReadAloudSessionPlay()}
          >
            <Show when={isPlaying()} fallback={<Play class="size-5" />}>
              <Pause class="size-5" />
            </Show>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0"
            aria-label="停止"
            onClick={() => stopReadAloudSession()}
          >
            <Square class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0"
            aria-label="下一段"
            onClick={() => void nextReadAloudParagraph()}
          >
            <SkipForward class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 px-2 text-xs"
            onClick={() => void nextReadAloudChapter()}
          >
            下一章
          </Button>
        </div>
      </div>
    </Show>
  );
}
