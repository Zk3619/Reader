/**
 * 导入书架书单（JSON 或 URL）
 */

import { createSignal } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { importBookshelf } from '@/lib/bookshelf/import-bookshelf';
import { showAppToast } from '@/components/shared/AppToasts';

export interface ImportBookshelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId?: number;
  onDone?: () => void;
}

export function ImportBookshelfDialog(props: ImportBookshelfDialogProps) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const handleImport = async () => {
    const value = text().trim();
    if (!value) {
      showAppToast({ title: '请输入 JSON 或书单 URL', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const result = await importBookshelf(value, props.groupId);
      showAppToast({
        title: '导入完成',
        description: `新增 ${result.added}，跳过 ${result.skipped}，失败 ${result.failed}`,
      });
      if (result.errors.length > 0) {
        console.warn('[import-bookshelf]', result.errors);
      }
      props.onOpenChange(false);
      setText('');
      props.onDone?.();
    } catch (e) {
      showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>导入书单</AppDialogTitle>
          <AppDialogDescription>
            仅导入书名、作者、简介，不会导出章节正文。支持 Legado 的 JSON 数组或远程
            bookshelf.json / books.json 链接。将按书名作者在已启用书源中搜索并加入书架。
          </AppDialogDescription>
        </AppDialogHeader>
        <textarea
          class="min-h-40 w-full rounded-lg border border-border bg-background p-3 text-sm"
          placeholder='[{"name":"书名","author":"作者","intro":"简介"}]'
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={busy()} onClick={() => void handleImport()}>
            {busy() ? '导入中…' : '导入'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
