import { appDialogScrollBodySpaceY2 } from '@/lib/ui/viewport-classes';
/**
 * 通过 URL 添加书籍对话框
 * 对齐 legado showAddBookByUrlAlert / BookshelfViewModel.addBookByUrl；
 * 增强：支持书籍文件直链（.txt / .epub 等）下载导入。
 */

import { createSignal, Show } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldTextArea } from '@/components/ui/text-field';
import { addBooksByUrl } from '@/lib/bookshelf/add-books-by-url';
import { bookshelfStore } from '@/stores/bookshelf';
import { cn } from '@/lib/utils';

export interface AddBookByUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddBookByUrlDialog(props: AddBookByUrlDialogProps) {
  const [url, setUrl] = createSignal('');
  const [isImporting, setIsImporting] = createSignal(false);
  const [progress, setProgress] = createSignal<{ current: number; total: number } | null>(null);

  const handleImport = async () => {
    const urlValue = url().trim();
    if (!urlValue) {
      return;
    }

    setIsImporting(true);
    setProgress(null);
    try {
      const groupId = bookshelfStore.state.currentGroup;
      const assignGroup = groupId >= 0 ? groupId : undefined;

      const result = await addBooksByUrl(urlValue, {
        groupId: assignGroup,
        onProgress: (p) => setProgress(p),
      });

      const { success, failed, skipped, errors } = result;

      if (success > 0) {
        showAppToast({
          title: failed > 0 ? '部分添加成功' : '添加成功',
          description:
            failed > 0
              ? `成功 ${success} 本（含已在书架 ${skipped} 本），失败 ${failed} 本`
              : skipped > 0 && success === skipped
                ? `${success} 本已在书架`
                : `已添加 ${success - skipped} 本${skipped > 0 ? `，${skipped} 本已在书架` : ''}`,
          variant: failed > 0 ? 'default' : 'success',
        });
        setUrl('');
        props.onOpenChange(false);
        window.dispatchEvent(new CustomEvent('bookshelf-refresh'));
      } else {
        const detail =
          errors[0] ??
          (failed > 0 ? '添加网址失败' : '请检查书源是否启用或 URL 是否正确');
        showAppToast({
          title: '添加失败',
          description: detail,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[AddBookByUrl] 导入失败:', error);
      showAppToast({
        title: '添加失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl((prev) => (prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim()));
      }
    } catch {
      showAppToast({
        title: '无法读取剪贴板',
        description: '请手动粘贴 URL',
        variant: 'destructive',
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isImporting()) return;
      setUrl('');
      setProgress(null);
    }
    props.onOpenChange(open);
  };

  const progressLabel = () => {
    const p = progress();
    if (!p) return null;
    return `添加中… (${p.current}/${p.total})`;
  };

  return (
    <AppDialog open={props.open} onOpenChange={handleOpenChange} modal={true}>
      <AppDialogContent class={cn(isImporting() && 'dialog-importing')}>
        <AppDialogHeader>
          <AppDialogTitle>添加书籍网址</AppDialogTitle>
          <AppDialogDescription>
            输入书源书籍详情页链接，将自动匹配书源并加入书架；也支持 .txt / .epub
            等文件直链。每行一个 URL，可在末尾附加
            <code class="mx-0.5 rounded bg-muted px-1 text-xs">, {'{'}&quot;origin&quot;:&quot;书源URL&quot;{'}'}</code>
            指定书源。
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody class={appDialogScrollBodySpaceY2}>
          <div class="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-8 px-2"
              disabled={isImporting()}
              onClick={() => void handlePaste()}
            >
              从剪贴板粘贴
            </Button>
          </div>
          <TextField>
            <TextFieldTextArea
              placeholder={'https://example.com/book/123\nhttps://cdn.example.com/book.epub'}
              value={url()}
              onInput={(e: Event) => setUrl((e.currentTarget as HTMLTextAreaElement).value)}
              rows={6}
              disabled={isImporting()}
              class="resize-none font-mono text-sm"
            />
          </TextField>
          <Show when={progressLabel()}>
            <p class="text-xs text-muted-foreground">{progressLabel()}</p>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setUrl('');
              props.onOpenChange(false);
            }}
            disabled={isImporting()}
          >
            取消
          </Button>
          <Button onClick={() => void handleImport()} disabled={!url().trim() || isImporting()}>
            {isImporting() ? progressLabel() ?? '添加中…' : '添加'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
