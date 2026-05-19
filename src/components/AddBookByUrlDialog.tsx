/**
 * 通过 URL 添加书籍对话框
 * 参考 legado 项目的 showAddBookByUrlAlert 实现
 */

import { createSignal } from 'solid-js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldTextArea } from '@/components/ui/text-field';
import { importBookFromUrl, importBooksFromUrls } from '@/lib/remote-book/url-importer';
import { bookshelfStore } from '@/stores/bookshelf';
import { cn } from '@/lib/utils';
import { dialogViewportLimits } from '@/lib/viewport-classes';

export interface AddBookByUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddBookByUrlDialog(props: AddBookByUrlDialogProps) {
  const [url, setUrl] = createSignal('');
  const [isImporting, setIsImporting] = createSignal(false);

  const handleImport = async () => {
    const urlValue = url().trim();
    if (!urlValue) {
      return;
    }

    setIsImporting(true);
    try {
      const groupId = bookshelfStore.state.currentGroup >= 0 
        ? bookshelfStore.state.currentGroup 
        : undefined;

      // 检查是否是多行 URL（批量导入）
      if (urlValue.includes('\n')) {
        await importBooksFromUrls(urlValue, { groupId });
      } else {
        await importBookFromUrl(urlValue, { groupId });
      }

      // 导入成功后关闭对话框并清空输入
      setUrl('');
      props.onOpenChange(false);
      window.dispatchEvent(new CustomEvent("bookshelf-refresh"));
    } catch (error) {
      console.error('导入失败:', error);
    } finally {
      setIsImporting(false);
    }
  };

  // 处理对话框关闭：导入过程中禁止关闭；关闭时丢弃未确认的输入
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isImporting()) return;
      setUrl(''); // 未点「导入」就关闭时清空输入
    }
    props.onOpenChange(open);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange} modal={true}>
      <DialogContent
        class={cn(dialogViewportLimits, 'flex flex-col overflow-hidden p-0', isImporting() && 'dialog-importing')}
      >
        <DialogHeader class="shrink-0 px-6 pt-6">
          <DialogTitle>添加网址</DialogTitle>
          <DialogDescription>
            输入书籍文件的 URL（支持 http/https），支持批量导入（每行一个 URL）
          </DialogDescription>
        </DialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <TextField>
            <TextFieldTextArea
              placeholder="输入书籍文件 URL，例如：&#10;https://example.com/book.txt&#10;https://example.com/book.epub&#10;&#10;支持批量导入，每行一个 URL"
              value={url()}
              onInput={(e: Event) => setUrl((e.currentTarget as HTMLTextAreaElement).value)}
              rows={6}
              disabled={isImporting()}
              class="resize-none"
            />
          </TextField>
        </div>
        <DialogFooter class="shrink-0 flex-row justify-end gap-2 border-t border-border/50 bg-background px-6 py-4">
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
          <Button
            onClick={handleImport}
            disabled={!url().trim() || isImporting()}
          >
            {isImporting() ? '导入中...' : '导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
