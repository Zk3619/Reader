/**
 * 当前书籍签列表（阅读内）
 */

import { createResource, For, Show } from 'solid-js';
import * as bookmarksDb from '@/lib/database/bookmarks';
import { deleteBookmark } from '@/lib/database/bookmarks';
import { bookmarkNoteForDisplay } from '@/lib/media/text/reader-bookmark';
import type { Book, Bookmark } from '@/types';
import { Button } from '@/components/ui/button';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
} from '@/components/media/viewer/viewer-app-overlay';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface ReaderBookmarksDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onJump: (bookmark: Bookmark) => void;
}

export function ReaderBookmarksDrawer(props: ReaderBookmarksDrawerProps) {
  const [bookmarks, { refetch }] = createResource(
    () => (props.open && props.book ? props.book : null),
    async (book) => {
      if (!book) return [];
      return bookmarksDb.getBookmarksByBook(book.name, book.author ?? '');
    },
  );

  const handleDelete = async (time: number) => {
    await deleteBookmark(time);
    refetch();
  };

  return (
    <ViewerAppDrawer open={props.open} onOpenChange={props.onOpenChange} snapPoints={[0, 1]} defaultSnapPoint={1}>
      <ViewerAppDrawerContent
        class={cn('flex flex-col', hDrawerPanel, 'max-h-[85dvh]')}
        showNativeDragHandle={false}
      >
        <ViewerAppDrawerHeader title="本书书签" />
        <ViewerAppDrawerBody class="min-h-0 flex-1 overflow-y-auto scroll-gutter-stable-both px-4 pb-2 mb-4">
          <Show when={bookmarks.loading}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>
          <Show when={!bookmarks.loading && (bookmarks() ?? []).length === 0}>
            <p class="py-8 text-center text-sm text-muted-foreground">暂无书签</p>
          </Show>
          <ul class="space-y-2">
            <For each={bookmarks() ?? []}>
              {(bm) => (
                <li class="rounded-lg border border-border/60 p-3">
                  <Button
                    type="button"
                    variant="ghost"
                    class="h-auto min-h-0 w-full min-w-0 justify-start px-0 py-0 text-left font-normal hover:bg-transparent"
                    onClick={() => {
                      props.onJump(bm);
                      props.onOpenChange(false);
                    }}
                  >
                    <div class="flex min-w-0 w-full flex-col gap-1 overflow-hidden">
                      <div class="line-clamp-1 text-sm font-medium">{bm.chapterName}</div>
                      <Show when={bm.bookText.trim()}>
                        <p class="line-clamp-2 min-w-0 wrap-break-word text-xs leading-relaxed text-muted-foreground">
                          {bm.bookText}
                        </p>
                      </Show>
                      <Show when={bookmarkNoteForDisplay(bm)}>
                        {(note) => (
                          <p class="line-clamp-2 min-w-0 wrap-break-word text-xs leading-relaxed text-muted-foreground/90">
                            {note()}
                          </p>
                        )}
                      </Show>
                    </div>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="mt-2 text-destructive"
                    onClick={() => void handleDelete(bm.time)}
                  >
                    删除
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </ViewerAppDrawerBody>
      </ViewerAppDrawerContent>
    </ViewerAppDrawer>
  );
}
