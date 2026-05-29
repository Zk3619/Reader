/**
 * 换源对话框（对齐 Legado ChangeBookSourceDialog）
 */

import { createSignal, For, Show } from 'solid-js';
import {
  searchChangeSourceCandidates,
  applyChangeSource,
  type ChangeSourceCandidate,
} from '@/lib/reader/change-source';
import type { Book } from '@/types';
import { Button } from '@/components/ui/button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';

export interface ReaderChangeSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  onChanged: (book: Book) => void;
}

export function ReaderChangeSourceDialog(props: ReaderChangeSourceDialogProps) {
  const [loading, setLoading] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [candidates, setCandidates] = createSignal<ChangeSourceCandidate[]>([]);

  const load = async () => {
    const book = props.book;
    if (!book) return;
    setLoading(true);
    try {
      const list = await searchChangeSourceCandidates(book);
      setCandidates(list);
      if (list.length === 0) {
        showAppToast({
          title: '未找到可换源',
          description: '其他书源中未搜索到同名同作者结果',
        });
      }
    } catch (e) {
      showAppToast({
        title: '搜索失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (open: boolean) => {
    props.onOpenChange(open);
    if (open && props.book) {
      setCandidates([]);
      void load();
    }
  };

  const apply = async (item: ChangeSourceCandidate) => {
    const book = props.book;
    if (!book) return;
    setApplying(true);
    try {
      const next = await applyChangeSource(book, item);
      showAppToast({ title: '换源成功', description: item.source.sourceName });
      props.onChanged(next);
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '换源失败',
        description: e instanceof Error ? e.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpen}>
      <AppDialogContent class="max-h-[85dvh] max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>换源</AppDialogTitle>
        </AppDialogHeader>
        <div class="space-y-3 px-6 pb-6">
          <p class="text-sm text-muted-foreground">
            在已启用书源中搜索与《{props.book?.name}》同名同作者的书籍，选择后迁移阅读进度。
          </p>
          <Show when={loading()}>
            <p class="text-sm text-muted-foreground">正在搜索…</p>
          </Show>
          <ul class="max-h-[50dvh] space-y-2 overflow-y-auto">
            <For each={candidates()}>
              {(item) => (
                <li class="rounded-lg border border-border/60 p-3">
                  <div class="font-medium">{item.source.sourceName}</div>
                  <div class="mt-1 truncate text-xs text-muted-foreground">
                    {item.searchBook.bookUrl}
                  </div>
                  <Button
                    class="mt-2 w-full"
                    size="sm"
                    disabled={applying()}
                    onClick={() => void apply(item)}
                  >
                    使用此书源
                  </Button>
                </li>
              )}
            </For>
          </ul>
          <Button variant="outline" class="w-full" disabled={loading()} onClick={() => void load()}>
            重新搜索
          </Button>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
