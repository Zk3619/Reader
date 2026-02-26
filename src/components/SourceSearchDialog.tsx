/**
 * 书源搜索对话框
 * 对齐 legado：从书源项右键「搜索」打开，使用该书源执行关键词搜索并展示结果
 */

import { createSignal, createEffect, Show, For } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { searchBook } from '@/lib/book-source/search';
import { addSearchBookToShelf } from '@/lib/book-source/add-to-shelf';
import { showAppToast } from '@/components/AppToasts';
import type { BookSource } from '@/types';
import type { SearchBook } from '@/types';

export interface SourceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前要搜索的书源，由书源项右键「搜索」传入 */
  source: BookSource | null;
  /** 点击某条搜索结果查看详情：由 App 跳转书籍信息页 */
  onOpenBookInfo?: (source: BookSource, book: SearchBook) => void;
  /** 加入书架成功后刷新书架等 */
  onAddedToShelf?: () => void;
}

export function SourceSearchDialog(props: SourceSearchDialogProps) {
  const [keyword, setKeyword] = createSignal('');
  const [results, setResults] = createSignal<SearchBook[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [addingBookUrl, setAddingBookUrl] = createSignal<string | null>(null);

  createEffect(() => {
    if (!props.open) {
      setKeyword('');
      setResults([]);
    }
  });

  const doSearch = async () => {
    const source = props.source;
    const q = keyword().trim();
    if (!source || !q) return;
    setLoading(true);
    setResults([]);
    try {
      const list = await searchBook(source, q);
      setResults(list);
      if (list.length === 0) {
        showAppToast({ title: '无结果', description: `关键词「${q}」未找到书籍`, variant: 'default' });
      }
    } catch (e) {
      console.error('书源搜索失败:', e);
      showAppToast({ title: '搜索失败', description: e instanceof Error ? e.message : '请稍后重试', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToShelf = async (sb: SearchBook) => {
    if (addingBookUrl() === sb.bookUrl) return;
    setAddingBookUrl(sb.bookUrl);
    try {
      const book = await addSearchBookToShelf(sb);
      if (book) {
        showAppToast({ title: '已加入书架', description: sb.name, variant: 'default' });
        props.onAddedToShelf?.();
      } else {
        showAppToast({ title: '加入书架失败', variant: 'destructive' });
      }
    } catch (e) {
      console.error('加入书架失败:', e);
      showAppToast({ title: '加入书架失败', description: String(e), variant: 'destructive' });
    } finally {
      setAddingBookUrl(null);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <DialogContent class="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader class="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle class="text-lg font-semibold">
            {props.source ? `搜索 · ${props.source.sourceName}` : '搜索'}
          </DialogTitle>
          <DialogDescription class="sr-only">
            输入关键词，使用当前书源搜索书籍
          </DialogDescription>
        </DialogHeader>
        <Show when={props.source}>
          <div class="shrink-0 flex gap-2 px-4 py-3 border-b border-border">
            <input
              type="text"
              placeholder="输入关键词"
              value={keyword()}
              onInput={(e) => setKeyword(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              class="h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="搜索关键词"
            />
            <Button size="sm" onClick={doSearch} disabled={loading()}>
              {loading() ? '搜索中…' : '搜索'}
            </Button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto">
            <Show when={loading()}>
              <div class="px-4 py-8 text-center text-sm text-muted-foreground">搜索中…</div>
            </Show>
            <Show when={!loading() && results().length === 0}>
              <div class="px-4 py-8 text-center text-sm text-muted-foreground">
                {keyword().trim() ? '无结果' : '输入关键词后点击「搜索」'}
              </div>
            </Show>
            <Show when={!loading() && results().length > 0}>
              <ul class="divide-y divide-border">
                <For each={results()}>
                  {(book) => (
                    <li class="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/50">
                      <div class="min-w-0 flex-1">
                        <p class="font-medium truncate">{book.name}</p>
                        <p class="text-xs text-muted-foreground truncate">{book.author || '—'}</p>
                      </div>
                      <div class="shrink-0 flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8 px-2"
                          onClick={() => props.onOpenBookInfo?.(props.source!, book)}
                        >
                          查看
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8 px-2"
                          onClick={() => handleAddToShelf(book)}
                          disabled={addingBookUrl() === book.bookUrl}
                        >
                          {addingBookUrl() === book.bookUrl ? '添加中…' : '加入书架'}
                        </Button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
