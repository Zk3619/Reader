/**
 * 按页模式朗读字级高亮覆盖层（Legado upPageAloudSpan + isReadAloud）
 */

import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import {
  paragraphCharRangeFromProgress,
  subscribeReadAloudProgress,
  type ReadAloudProgress,
} from '@/lib/media/text/read-aloud-progress';
import { computePagedAloudHighlightRects } from '@/lib/media/text/read-aloud-paged-span';
import { isReadAloudSessionActive } from '@/lib/media/text/read-aloud-session';
import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';

export interface ReaderPagedAloudOverlayProps {
  layout: () => ReaderChapterLayout | null | undefined;
  pageIndex: () => number;
  chapterIndex: () => number;
  contentOffsetY: () => number;
}

export function ReaderPagedAloudOverlay(props: ReaderPagedAloudOverlayProps) {
  const [progress, setProgress] = createSignal<ReadAloudProgress | null>(null);

  onMount(() => {
    const unsub = subscribeReadAloudProgress(setProgress);
    onCleanup(unsub);
  });

  const highlightLayers = createMemo(() => {
    if (!isReadAloudSessionActive()) {
      return { paragraphRects: [], readRects: [] };
    }
    const p = progress();
    const l = props.layout();
    const pageIdx = props.pageIndex();
    if (!p || !l || p.chapterIndex !== props.chapterIndex()) {
      return { paragraphRects: [], readRects: [] };
    }
    const range = paragraphCharRangeFromProgress(p);
    if (!range) return { paragraphRects: [], readRects: [] };
    const page = l.pages[pageIdx];
    if (!page?.lines?.length) return { paragraphRects: [], readRects: [] };
    return computePagedAloudHighlightRects(
      page.lines,
      range.start,
      range.end,
      range.readEnd,
      props.contentOffsetY(),
    );
  });

  return (
    <>
      <For each={highlightLayers().paragraphRects}>
        {(rect) => (
          <div
            class="reader-aloud-highlight pointer-events-none absolute inset-x-0 z-[2]"
            style={{
              top: `${rect.top}px`,
              height: `${rect.height}px`,
            }}
            aria-hidden="true"
          />
        )}
      </For>
      <Show when={highlightLayers().readRects.length > 0}>
        <For each={highlightLayers().readRects}>
          {(rect) => (
            <div
              class="reader-aloud-read-highlight pointer-events-none absolute z-[3]"
              style={{
                left: rect.width > 0 ? `${rect.left}px` : 0,
                right: rect.width > 0 ? undefined : 0,
                width: rect.width > 0 ? `${rect.width}px` : undefined,
                top: `${rect.top}px`,
                height: `${rect.height}px`,
              }}
              aria-hidden="true"
            />
          )}
        </For>
      </Show>
    </>
  );
}
