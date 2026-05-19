/**
 * 书源本地导入对话框
 * 对齐 legado：选择本地 .json / .txt 书源文件导入
 */

import { createSignal } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseBookSourceJson } from '@/lib/book-source/source-import';
import * as sourcesDb from '@/lib/database/sources';
import { showAppToast } from '@/components/AppToasts';
import { cn } from '@/lib/utils';
import { dialogViewportLimits } from '@/lib/viewport-classes';

export interface ImportSourceLocalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ImportSourceLocalDialog(props: ImportSourceLocalDialogProps) {
  const [isImporting, setIsImporting] = createSignal(false);
  const [fileName, setFileName] = createSignal<string | null>(null);

  const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt,application/json,text/plain';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setFileName(file.name);
      setIsImporting(true);
      try {
        const text = await file.text();
        const list = parseBookSourceJson(text);
        if (list.length === 0) {
          showAppToast({ title: '本地导入书源', description: '未解析到有效书源', variant: 'default' });
          props.onSuccess?.();
          props.onOpenChange(false);
          return;
        }
        for (const source of list) {
          await sourcesDb.insertSource(source);
        }
        window.dispatchEvent(new CustomEvent('sources-refresh'));
        showAppToast({ title: '本地导入书源', description: `已导入 ${list.length} 条书源`, variant: 'default' });
        props.onSuccess?.();
        props.onOpenChange(false);
      } catch (err) {
        console.error('书源本地导入失败:', err);
        showAppToast({ title: '本地导入书源失败', description: String(err), variant: 'destructive' });
      } finally {
        setIsImporting(false);
        setFileName(null);
      }
    };
    input.click();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && isImporting()) return;
    props.onOpenChange(open);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange} modal>
      <DialogContent
        class={cn(dialogViewportLimits, 'flex flex-col overflow-hidden p-0', isImporting() && 'dialog-importing')}
      >
        <DialogHeader class="shrink-0 px-6 pt-6">
          <DialogTitle>本地导入书源</DialogTitle>
          <DialogDescription>
            选择本地的书源文件（.json 或 .txt，兼容 legado 书源格式）进行导入
          </DialogDescription>
        </DialogHeader>
        <div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <Button
            variant="outline"
            class="w-full"
            onClick={triggerFileInput}
            disabled={isImporting()}
          >
            {isImporting() ? (fileName() ? `正在导入 ${fileName()}...` : '导入中...') : '选择文件'}
          </Button>
        </div>
        <DialogFooter class="shrink-0 flex-row justify-end gap-2 border-t border-border/50 bg-background px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isImporting()}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
