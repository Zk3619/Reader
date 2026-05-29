/**
 * 阅读内全书搜索（对齐 Legado SearchMenu / SearchContentActivity）
 */

import { createSignal, For, Show } from 'solid-js';
import { readerStore } from '@/stores/reader';
import { searchBookContent, type BookSearchHit } from '@/lib/reader/book-content-search';
import { plainTextForAloud } from '@/lib/reader/read-aloud';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface ReaderSearchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJumpToChapter: (index: number) => void;
}

export function ReaderSearchDrawer(props: ReaderSearchDrawerProps) {
  const [keyword, setKeyword] = createSignal('');
  const [searching, setSearching] = createSignal(false);
  const [hits, setHits] = createSignal<BookSearchHit[]>([]);
  const [activeIndex, setActiveIndex] = createSignal(0);

  const runSearch = async () => {
    const book = readerStore.state.book;
    const catalog = readerStore.state.catalog;
    const kw = keyword().trim();
    if (!book || !kw) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const currentPlain = plainTextForAloud(readerStore.state.content);
      const results = await searchBookContent(book, catalog, kw, {
        startIndex: readerStore.state.chapterIndex,
        currentChapterPlain: currentPlain,
      });
      setHits(results);
      setActiveIndex(0);
    } finally {
      setSearching(false);
    }
  };

  const goHit = (hit: BookSearchHit) => {
    props.onOpenChange(false);
    props.onJumpToChapter(hit.chapterIndex);
  };

  const goPrev = () => {
    const list = hits();
    if (list.length === 0) return;
    const next = (activeIndex() - 1 + list.length) % list.length;
    setActiveIndex(next);
    goHit(list[next]!);
  };

  const goNext = () => {
    const list = hits();
    if (list.length === 0) return;
    const next = (activeIndex() + 1) % list.length;
    setActiveIndex(next);
    goHit(list[next]!);
  };

  return (
    <AppDrawer open={props.open} onOpenChange={props.onOpenChange} snapPoints={[0, 1]} defaultSnapPoint={1}>
      <AppDrawerContent
        class={cn('z-100 flex flex-col', hDrawerPanel, 'max-h-[85dvh]')}
        overlayClass="z-100"
        showNativeDragHandle={false}
      >
        <AppDrawerHeader title="全书搜索" />
        <AppDrawerBody class="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-6">
          <form
            class="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <TextField class="flex-1">
              <TextFieldInput
                value={keyword()}
                onInput={(e) => setKeyword(e.currentTarget.value)}
                placeholder="输入关键词"
              />
            </TextField>
            <Button type="submit" disabled={searching()}>
              {searching() ? '搜索中…' : '搜索'}
            </Button>
          </form>
          <p class="text-xs text-muted-foreground">
            优先搜索已缓存章节；未缓存章节需先阅读或离线缓存后再搜。
          </p>
          <Show when={hits().length > 0}>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" onClick={goPrev}>
                上一处
              </Button>
              <Button variant="outline" size="sm" onClick={goNext}>
                下一处
              </Button>
              <span class="self-center text-xs text-muted-foreground">
                {hits().length} 处命中
              </span>
            </div>
          </Show>
          <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto scroll-gutter-stable-both">
            <For each={hits()}>
              {(hit, i) => (
                <li>
                  <button
                    type="button"
                    class={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                      i() === activeIndex() && 'border-primary bg-muted/40',
                    )}
                    onClick={() => {
                      setActiveIndex(i());
                      goHit(hit);
                    }}
                  >
                    <div class="font-medium text-foreground">{hit.chapterTitle}</div>
                    <div class="mt-1 text-xs text-muted-foreground">{hit.snippet}</div>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={!searching() && keyword().trim() && hits().length === 0}>
            <p class="text-center text-sm text-muted-foreground">未找到匹配（可尝试先缓存更多章节）</p>
          </Show>
        </AppDrawerBody>
      </AppDrawerContent>
    </AppDrawer>
  );
}
