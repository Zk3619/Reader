/**
 * 书签列表页（对齐 Legado ui/book/bookmark）
 */

import { createResource, For, Show } from 'solid-js';
import * as bookmarksDb from '@/lib/database/bookmarks';
import { deleteBookmark } from '@/lib/database/bookmarks';
import { Button } from '@/components/ui/button';
import type { Bookmark } from '@/types';

export interface BookmarkPageProps {
  onOpenBook?: (bookName: string, bookAuthor: string) => void;
}

export function BookmarkPage(props: BookmarkPageProps) {
  const [bookmarks, { refetch }] = createResource(() => bookmarksDb.getAllBookmarks());

  const grouped = () => {
    const list = bookmarks() ?? [];
    const map = new Map<string, Bookmark[]>();
    for (const bm of list) {
      const key = `${bm.bookName}\0${bm.bookAuthor}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(bm);
    }
    return [...map.entries()].map(([key, items]) => {
      const [bookName, bookAuthor] = key.split('\0');
      return { bookName, bookAuthor, items };
    });
  };

  return (
    <div class="space-y-4">
      <Show when={bookmarks.loading}>
        <p class="text-sm text-muted-foreground">加载书签…</p>
      </Show>
      <Show when={!bookmarks.loading && grouped().length === 0}>
        <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
          <p>暂无书签</p>
          <p class="mt-2 text-xs">在阅读器中通过「更多 → 添加书签」创建</p>
        </div>
      </Show>
      <For each={grouped()}>
        {(group) => (
          <section class="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div class="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
              <div class="min-w-0">
                <h3 class="truncate font-medium">{group.bookName}</h3>
                <Show when={group.bookAuthor}>
                  <p class="truncate text-xs text-muted-foreground">{group.bookAuthor}</p>
                </Show>
              </div>
              <Show when={props.onOpenBook}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    props.onOpenBook?.(group.bookName, group.bookAuthor)
                  }
                >
                  找书
                </Button>
              </Show>
            </div>
            <ul class="divide-y divide-border/40">
              <For each={group.items}>
                {(bm) => (
                  <li class="px-4 py-3">
                    <div class="text-sm font-medium">{bm.chapterName}</div>
                    <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {bm.bookText || bm.content}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="mt-2 text-destructive"
                      onClick={() => {
                        void deleteBookmark(bm.time).then(() => refetch());
                      }}
                    >
                      删除
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}
