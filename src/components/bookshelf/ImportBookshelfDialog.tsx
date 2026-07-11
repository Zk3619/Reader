/**
 * 导入书架书单（JSON 或 URL）
 */

import { createSignal } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AppTextField, AppTextFieldTextArea } from '@/components/shared/AppTextField';
import { importBookshelf } from '@/lib/bookshelf/import-bookshelf';
import { showAppToast } from '@/components/shared/AppToasts';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { readBytes } from '@/lib/platform/fs/read-write';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { FileTextIcon } from '@/components/shared/icons';

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

  const handlePickFile = async () => {
    try {
      const picked = await pickFile({
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      const bytes = await readBytes(picked.ref);
      const content = new TextDecoder('utf-8').decode(bytes);
      if (!content.trim()) {
        showAppToast({ title: '文件为空', variant: 'destructive' });
        return;
      }
      setText(content);
    } catch (e) {
      if (isUserCancelled(e)) return;
      showAppToast({
        title: '读取文件失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>导入书单</AppDialogTitle>
        </AppDialogHeader>

        <AppDialogScrollBody>
          <div class="space-y-2">
            <Label for="import-bookshelf-content">书单内容</Label>
            <p class="text-sm text-muted-foreground">
              仅导入书名、作者、简介，不会导出章节正文。支持 Legado 的 JSON 数组或远程
              bookshelf.json / books.json 链接。将按书名作者在已启用书源中搜索并加入书架。
            </p>
            <AppTextField>
              <AppTextFieldTextArea
                id="import-bookshelf-content"
                class="min-h-40 font-mono text-sm"
                placeholder='[{"name":"书名","author":"作者","intro":"简介"}]'
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
              />
            </AppTextField>
          </div>
        </AppDialogScrollBody>

        <AppDialogFooter class="flex-wrap gap-2 sm:justify-between">
          <Button
            variant="outline"
            class="sm:mr-auto"
            disabled={busy()}
            onClick={() => void handlePickFile()}
          >
            <FileTextIcon class="mr-2 h-4 w-4" size={16} />
            选择文件
          </Button>
          <div class="flex flex-wrap gap-2 sm:ml-auto">
            <Button variant="outline" disabled={busy()} onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button disabled={busy()} onClick={() => void handleImport()}>
              {busy() ? '导入中…' : '导入'}
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
