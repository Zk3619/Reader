/**
 * 阅读中编辑章节缓存正文（对齐 Legado ContentEditDialog）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { writeCachedChapterRaw } from '@/lib/chapter-cache/storage';
import {
  isLocalBookContentEditable,
  readChapterRawForEdit,
} from '@/lib/chapter-cache/read-chapter-raw-for-edit';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldTextArea } from '@/components/ui/text-field';
import { showAppToast } from '@/components/shared/AppToasts';

export interface ContentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 内嵌阅读器层 z-index */
  portalZClass?: string;
}

export function ContentEditDialog(props: ContentEditDialogProps) {
  const [content, setContent] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  const book = () => textViewerStore.state.book;
  const chapterIndex = () => textViewerStore.state.chapterIndex;
  const chapter = () => textViewerStore.state.catalog[chapterIndex()];

  createEffect(() => {
    if (!props.open) return;
    const b = book();
    const idx = chapterIndex();
    const ch = chapter();
    if (!b || !isLocalBookContentEditable(b)) {
      setContent('');
      return;
    }
    setLoading(true);
    void readChapterRawForEdit(b, idx, ch, textViewerStore.state.content ?? '')
      .then(setContent)
      .catch((e) => {
        console.error(e);
        showAppToast({ title: '加载正文失败', variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  });

  const handleSave = async () => {
    const b = book();
    const idx = chapterIndex();
    if (!b || !isLocalBookContentEditable(b)) return;
    const next = content().trim();
    if (!next) {
      showAppToast({ title: '正文不能为空', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await writeCachedChapterRaw(b, idx, next);
      await textViewerStore.reprocessDisplayedChapter(idx);
      showAppToast({ title: '正文已保存' });
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent
        portalToBody
        portalZClass={props.portalZClass}
        class="flex max-h-[min(90vh,720px)] w-[min(42rem,92vw)] flex-col"
      >
        <AppDialogHeader>
          <AppDialogTitle>编辑正文</AppDialogTitle>
          <AppDialogDescription>
            修改当前章节的缓存原文，保存后将重新应用替换净化等展示处理。本地 TXT/EPUB
            会写入章节缓存并优先于文件内容展示。
            <Show when={chapter()?.title}>
              <span class="mt-1 block truncate">章节：{chapter()?.title}</span>
            </Show>
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 flex-1 px-6 pb-2">
          <Show
            when={!loading()}
            fallback={
              <div class="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
                加载中…
              </div>
            }
          >
            <TextField class="h-full">
              <TextFieldTextArea
                class="min-h-[min(50dvh,24rem)] resize-y font-mono text-sm leading-relaxed"
                value={content()}
                onInput={(e) => setContent(e.currentTarget.value)}
                placeholder="章节正文…"
                aria-label="章节正文"
              />
            </TextField>
          </Show>
        </div>
        <AppDialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={saving()}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={loading() || saving()}>
            {saving() ? '保存中…' : '保存'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
