/**
 * 全部书签页（对齐 legado AllBookmarkActivity）
 */

import { createMemo, createResource, createSignal, For, Show } from 'solid-js';
import { BookmarkEditDialog } from '@/components/bookmark/BookmarkEditDialog';
import { BookmarkRowMenu } from '@/components/bookmark/BookmarkRowMenu';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import { getBookByNameAndAuthor } from '@/lib/database/books';
import * as bookmarksDb from '@/lib/database/bookmarks';
import {
  bookmarkNoteForDisplay,
  buildBookmarkBookGroups,
} from '@/lib/bookmark/bookmark-list';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
} from '@/lib/ui/viewport-classes';
import { isMobile } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import type { Book, Bookmark } from '@/types';

const BOOKMARK_GROUP_CARD_CLASS =
  'flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card';

export interface BookmarkPageProps {
  onOpenBookmark?: (bookmark: Bookmark, book: Book) => void;
}

function BookmarkBookGroupCard(props: {
  bookName: string;
  bookAuthor: string;
  bookmarks: readonly Bookmark[];
  onOpen: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}) {
  return (
    <section class={BOOKMARK_GROUP_CARD_CLASS}>
      <header class="shrink-0 border-b border-border/40 px-4 py-3">
        <h3 class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span class="min-w-0 truncate text-primary">{props.bookName}</span>
          <Show when={props.bookAuthor.trim()}>
            <>
              <span class="shrink-0 text-muted-foreground/70">·</span>
              <span class="min-w-0 truncate font-medium text-primary/90">
                {props.bookAuthor}
              </span>
            </>
          </Show>
        </h3>
      </header>

      <ul class="flex min-h-0 flex-1 flex-col divide-y divide-border/30">
        <For each={props.bookmarks}>
          {(bookmark) => (
            <BookmarkItemRow
              bookmark={bookmark}
              onOpen={() => props.onOpen(bookmark)}
              onEdit={() => props.onEdit(bookmark)}
              onDelete={() => props.onDelete(bookmark)}
            />
          )}
        </For>
      </ul>
    </section>
  );
}

function BookmarkItemRow(props: {
  bookmark: Bookmark;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bookmark = () => props.bookmark;
  const bookText = () => bookmark().bookText.trim();
  const note = () => bookmarkNoteForDisplay(bookmark());
  const positionHint = () => {
    const pct = Math.round(Math.max(0, Math.min(100, bookmark().chapterPos * 100)));
    return pct > 0 ? `${pct}%处` : null;
  };

  return (
    <li class="group flex min-h-[4.5rem] min-w-0 items-stretch">
      <Button
        type="button"
        variant="ghost"
        class="h-auto min-h-0 min-w-0 flex-1 items-stretch justify-start rounded-none px-4 py-3 text-left font-normal hover:bg-muted/40"
        onClick={props.onOpen}
      >
        <div class="flex min-w-0 w-full flex-col gap-1 overflow-hidden">
          <div class="line-clamp-1 text-sm font-medium text-foreground">
            {bookmark().chapterName || '未命名章节'}
            <Show when={positionHint()}>
              {(hint) => (
                <span class="font-normal text-muted-foreground"> · {hint()}</span>
              )}
            </Show>
          </div>
          <Show when={bookText()}>
            <p class="line-clamp-2 min-w-0 break-words text-xs leading-relaxed text-muted-foreground">
              {bookText()}
            </p>
          </Show>
          <Show when={note()}>
            <p class="line-clamp-2 min-w-0 break-words text-xs leading-relaxed text-muted-foreground/90">
              {note()}
            </p>
          </Show>
        </div>
      </Button>
      <div class="flex shrink-0 items-center self-center pr-1">
        <BookmarkRowMenu onEdit={props.onEdit} onDelete={props.onDelete} />
      </div>
    </li>
  );
}

export function BookmarkPage(props: BookmarkPageProps) {
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingBookmark, setEditingBookmark] = createSignal<Bookmark | null>(null);

  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion, isMobile());

  const [bookmarks, { refetch }] = createResource(() => bookmarksDb.getAllBookmarks());
  const groups = createMemo(() => buildBookmarkBookGroups(bookmarks() ?? []));

  function openEditDialog(bookmark: Bookmark) {
    setEditingBookmark(bookmark);
    setEditOpen(true);
  }

  async function handleOpenBookmark(bookmark: Bookmark) {
    const book = await getBookByNameAndAuthor(bookmark.bookName, bookmark.bookAuthor);
    if (book) {
      props.onOpenBookmark?.(bookmark, book);
      return;
    }
    openEditDialog(bookmark);
  }

  async function handleDeleteBookmark(bookmark: Bookmark) {
    await bookmarksDb.deleteBookmark(bookmark.time);
    refetch();
  }

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        title="书签"
        description="查看你的全部书签"
        titleSlot={
          <PageToolbarTitleDropdown
            title="书签"
            description="查看你的全部书签"
            dropdownEnabled={false}
          />
        }
      />

      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
          <Show when={bookmarks.loading}>
            <p class="text-sm text-muted-foreground">加载书签…</p>
          </Show>

          <Show when={!bookmarks.loading && groups().length === 0}>
            <div class="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              <p>暂无书签</p>
              <p class="mt-2 text-xs">在阅读器中通过「更多 → 添加书签」创建</p>
            </div>
          </Show>

          <Show when={!bookmarks.loading && groups().length > 0}>
            <For each={groups()}>
              {(group) => (
                <BookmarkBookGroupCard
                  bookName={group.bookName}
                  bookAuthor={group.bookAuthor}
                  bookmarks={group.bookmarks}
                  onOpen={(bookmark) => void handleOpenBookmark(bookmark)}
                  onEdit={openEditDialog}
                  onDelete={(bookmark) => void handleDeleteBookmark(bookmark)}
                />
              )}
            </For>
          </Show>
        </div>
      </div>

      <BookmarkEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        bookmark={editingBookmark()}
        onSaved={() => refetch()}
        onDeleted={() => refetch()}
      />
    </section>
  );
}
