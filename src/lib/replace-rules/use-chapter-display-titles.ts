/**
 * 目录列表章节展示标题（含替换净化）
 */

import { createSignal, createEffect, onCleanup } from 'solid-js';
import { buildChapterDisplayTitleMap } from '@/lib/replace-rules/chapter-display-title';
import { formatTocChapterDisplayTitle } from '@/lib/catalog/chapter-list-layout';
import type { Book, BookChapter, SearchBook } from '@/types';

export function useChapterDisplayTitles(
  chapters: () => readonly BookChapter[],
  book: () => Book | SearchBook | null | undefined,
  sourceUrl: () => string | null | undefined,
  enabled: () => boolean = () => true,
  uiConfig: () => Pick<import('@/lib/media/text/reader-ui-config').TextViewerUiConfig, 'chineseConverterType'> = () => ({}),
) {
  const [titles, setTitles] = createSignal<Map<number, string>>(new Map());
  let requestId = 0;

  const resolveTitle = (index: number, chapter?: BookChapter) =>
    titles().get(index) ?? formatTocChapterDisplayTitle(chapter?.title, index);

  createEffect(() => {
    const currentBook = book();
    const list = chapters();
    const origin = sourceUrl();
    const config = uiConfig();
    const replaceTitles = enabled();
    if (!currentBook || list.length === 0) {
      setTitles(new Map());
      return;
    }

    const id = ++requestId;
    void buildChapterDisplayTitleMap(list, currentBook, origin, {
      useReplace: replaceTitles,
      uiConfig: config,
    }).then((map) => {
      if (id === requestId) setTitles(map);
    });
  });

  createEffect((prev) => {
    if (typeof window === 'undefined') return prev;
    const handler = () => {
      const currentBook = book();
      const list = chapters();
      if (!currentBook || list.length === 0) return;
      const id = ++requestId;
      void buildChapterDisplayTitleMap(list, currentBook, sourceUrl(), {
        useReplace: enabled(),
        uiConfig: uiConfig(),
      }).then((map) => {
        if (id === requestId) setTitles(map);
      });
    };
    window.addEventListener('replace-rules-refresh', handler);
    window.addEventListener('reader-scroll-chapters-refresh', handler);
    onCleanup(() => {
      window.removeEventListener('replace-rules-refresh', handler);
      window.removeEventListener('reader-scroll-chapters-refresh', handler);
    });
    return undefined;
  });

  return { resolveTitle };
}
