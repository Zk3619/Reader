/**
 * 滚动模式朗读字级高亮（段内已读部分）
 */

import { For, createEffect, createSignal, onCleanup } from 'solid-js';
import { plainTextForAloud } from '@/lib/media/text/read-aloud';

export interface ReaderScrollAloudHighlightsProps {
  host?: HTMLElement;
  paragraphIndex?: number;
  readCharIndex: number;
}

type LocalRect = { left: number; top: number; width: number; height: number };

function collectRangeRects(host: HTMLElement, charCount: number): LocalRect[] {
  if (charCount <= 0 || typeof document === 'undefined') return [];
  const textNode = findPrimaryTextNode(host);
  if (!textNode) return [];
  const text = textNode.textContent ?? '';
  if (!text) return [];
  const end = Math.min(charCount, text.length);
  const range = document.createRange();
  try {
    range.setStart(textNode, 0);
    range.setEnd(textNode, end);
  } catch {
    return [];
  }
  const hostRect = host.getBoundingClientRect();
  return Array.from(range.getClientRects())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      left: r.left - hostRect.left,
      top: r.top - hostRect.top,
      width: r.width,
      height: r.height,
    }));
}

function findPrimaryTextNode(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let best: Text | null = null;
  let bestLen = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = (node.textContent ?? '').trim().length;
    if (len > bestLen) {
      best = node;
      bestLen = len;
    }
  }
  return best;
}

export function ReaderScrollAloudHighlights(props: ReaderScrollAloudHighlightsProps) {
  const [rects, setRects] = createSignal<LocalRect[]>([]);
  let raf = 0;

  const scheduleMeasure = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      const host =
        props.host ??
        (props.paragraphIndex != null && typeof document !== 'undefined'
          ? (document.querySelector(
              `[data-reader-aloud-paragraph="${props.paragraphIndex}"]`,
            ) as HTMLElement | null)
          : null);
      if (!host) {
        setRects([]);
        return;
      }
      setRects(collectRangeRects(host, props.readCharIndex));
    });
  };

  createEffect(scheduleMeasure);
  onCleanup(() => {
    if (raf) cancelAnimationFrame(raf);
  });

  return (
    <For each={rects()}>
      {(rect) => (
        <div
          class="reader-aloud-read-highlight pointer-events-none absolute z-1"
          style={{
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          aria-hidden="true"
        />
      )}
    </For>
  );
}

export function resolveScrollAloudReadCharIndex(
  paragraphText: string,
  paragraphCharIndex: number | undefined,
): number {
  const len = plainTextForAloud(paragraphText).length;
  if (paragraphCharIndex == null) return 0;
  return Math.min(Math.max(0, paragraphCharIndex), len);
}
