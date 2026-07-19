/**
 * 编辑书签（对齐 legado BookmarkDialog）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldTextArea } from '@/components/shared/AppTextField';
import {
  AppDialog,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { deleteBookmark, updateBookmark } from '@/lib/database/bookmarks';
import type { Bookmark } from '@/types';

export interface BookmarkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmark: Bookmark | null;
  showDelete?: boolean;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export function BookmarkEditDialog(props: BookmarkEditDialogProps) {
  const [bookText, setBookText] = createSignal('');
  const [content, setContent] = createSignal('');

  createEffect(() => {
    if (!props.open || !props.bookmark) return;
    setBookText(props.bookmark.bookText ?? '');
    setContent(props.bookmark.content ?? '');
  });

  async function handleSave() {
    const bookmark = props.bookmark;
    if (!bookmark) return;
    await updateBookmark({
      ...bookmark,
      bookText: bookText().trim(),
      content: content().trim(),
    });
    props.onSaved?.();
    props.onOpenChange(false);
  }

  async function handleDelete() {
    const bookmark = props.bookmark;
    if (!bookmark) return;
    await deleteBookmark(bookmark.time);
    props.onDeleted?.();
    props.onOpenChange(false);
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent layout="app" class="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>书签</AppDialogTitle>
        </AppDialogHeader>

        <div class="space-y-4 px-6 pb-2">
          <div class="space-y-1">
            <Label>章节</Label>
            <p class="text-sm font-medium text-foreground">
              {props.bookmark?.chapterName || '—'}
            </p>
          </div>

          <div class="space-y-2">
            <Label for="bookmark-book-text">内容</Label>
            <AppTextField>
              <AppTextFieldTextArea
                id="bookmark-book-text"
                rows={3}
                placeholder="书签摘要"
                value={bookText()}
                onInput={(e) => setBookText(e.currentTarget.value)}
              />
            </AppTextField>
          </div>

          <div class="space-y-2">
            <Label for="bookmark-note-content">笔记</Label>
            <AppTextField>
              <AppTextFieldTextArea
                id="bookmark-note-content"
                rows={4}
                placeholder="笔记内容"
                value={content()}
                onInput={(e) => setContent(e.currentTarget.value)}
              />
            </AppTextField>
          </div>
        </div>

        <AppDialogFooter class="justify-between px-6 pb-6">
          <Show when={props.showDelete !== false}>
            <Button
              variant="ghost"
              class="mr-auto text-destructive hover:text-destructive"
              onClick={() => void handleDelete()}
            >
              删除
            </Button>
          </Show>
          <div class="flex gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()}>确定</Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
