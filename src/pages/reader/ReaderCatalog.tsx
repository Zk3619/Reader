/**
 * 阅读器目录列表
 * 参考 legado：卷/章层级、当前章节高亮、点击跳转、自动滚动到当前章节
 * - 卷（isVolume）作为分组标题展示，其下章节缩进
 */

import { For, createEffect } from 'solid-js';
import { readerStore } from '@/stores/reader';
import { cn } from '@/lib/utils';
import type { BookChapter } from '@/types';

export interface ReaderCatalogProps {
  onSelectChapter: (index: number) => void;
  onClose?: () => void;
  /** 目录是否打开，用于触发滚动到当前章节（仅当当前章变化时滚动，避免每次打开都重滚） */
  open?: boolean;
  /** 缓存的滚动位置，打开时恢复 */
  initialScrollTop?: number;
  /** 滚动时上报，用于关闭后缓存 */
  onScrollTop?: (scrollTop: number) => void;
}

/** 判断章节是否属于某个卷下（即前面存在卷标题，应缩进显示） */
function isUnderVolume(list: BookChapter[], idx: number): boolean {
  for (let k = idx - 1; k >= 0; k--) {
    if (list[k].isVolume) return true;
  }
  return false;
}

export function ReaderCatalog(props: ReaderCatalogProps) {
  /** 目录列表使用 readerStore 中的缓存（openBook 时已加载），不在此处发起请求 */
  const catalog = () => readerStore.state.catalog;
  const chapterIndex = () => readerStore.state.chapterIndex;
  let scrollContainer: HTMLDivElement | undefined;
  let currentChapterButton: HTMLButtonElement | undefined;
  /** 上次滚动到的章节索引，仅当当前章变化时才滚动，避免每次打开目录都重新滚动 */
  let lastScrolledToIndex = -1;
  let lastCatalogLength = 0;

  createEffect(() => {
    const list = catalog();
    if (list.length !== lastCatalogLength) {
      lastCatalogLength = list.length;
      lastScrolledToIndex = -1;
    }
    if (!props.open || list.length === 0) return;
    const idx = chapterIndex();
    if (idx === lastScrolledToIndex) return;
    if (!scrollContainer || !currentChapterButton) return;
    lastScrolledToIndex = idx;
    requestAnimationFrame(() => {
      if (!scrollContainer || !currentChapterButton) return;
      const buttonRect = currentChapterButton.getBoundingClientRect();
      const scrollTop = currentChapterButton.offsetTop - scrollContainer.offsetTop -
        (scrollContainer.clientHeight / 2) + (buttonRect.height / 2);
      const targetTop = Math.max(0, scrollTop);
      scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' });
      props.onScrollTop?.(targetTop);
    });
  });

  const list = () => catalog();

  // 恢复缓存的滚动位置；先标记当前章已处理，避免“滚到当前章”效果覆盖
  createEffect(() => {
    if (!props.open || !scrollContainer) return;
    const initial = props.initialScrollTop ?? 0;
    if (initial <= 0) return;
    lastScrolledToIndex = chapterIndex();
    requestAnimationFrame(() => {
      if (scrollContainer) scrollContainer.scrollTop = initial;
    });
  });

  return (
    <div
      ref={scrollContainer}
      class="reader-catalog-scroll flex-1 overflow-y-auto"
      onScroll={() => {
        if (scrollContainer && props.onScrollTop) props.onScrollTop(scrollContainer.scrollTop);
      }}
    >
      <ul class="space-y-0.5 py-2">
        <For each={list()}>
          {(chapter: BookChapter, index) => {
            const idx = index();
            const isVol = () => chapter.isVolume;
            const isCurrent = () => idx === chapterIndex();
            const underVolume = () => isUnderVolume(list(), idx);

            if (isVol()) {
              return (
                <li class="mt-1 first:mt-0">
                  <button
                    ref={(el) => {
                      if (isCurrent()) currentChapterButton = el;
                    }}
                    type="button"
                    class={cn(
                      'w-full truncate px-4 py-2.5 text-left text-sm rounded-md',
                      'text-muted-foreground hover:bg-muted/80',
                      isCurrent() && 'bg-primary/10 font-medium text-primary'
                    )}
                    onClick={() => props.onSelectChapter(idx)}
                  >
                    {chapter.title}
                  </button>
                </li>
              );
            }

            return (
              <li class={cn(underVolume() && 'pl-4')}>
                <button
                  ref={(el) => {
                    if (isCurrent()) currentChapterButton = el;
                  }}
                  type="button"
                  class={cn(
                    'w-full truncate px-4 py-2.5 text-left text-sm transition-colors rounded-md',
                    isCurrent()
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground hover:bg-muted'
                  )}
                  onClick={() => props.onSelectChapter(idx)}
                >
                  {chapter.title || `第 ${idx + 1} 章`}
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}
