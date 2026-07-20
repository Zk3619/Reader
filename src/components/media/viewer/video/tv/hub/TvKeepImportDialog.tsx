/**
 * 导入影视片单（JSON 或 URL）
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
import { importTvKeepPlaylist } from '@/lib/media/tv/tv-keep-export';
import { showAppToast } from '@/components/shared/AppToasts';
import { pickFile } from '@/lib/platform/fs/pick-file';
import { readBytes } from '@/lib/platform/fs/read-write';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { FileTextIcon } from '@/components/shared/icons';
import { appDialogSettingsShell } from '@/lib/ui/viewport-classes';

export interface TvKeepImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function TvKeepImportDialog(props: TvKeepImportDialogProps) {
  const [text, setText] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const handleImport = async () => {
    const value = text().trim();
    if (!value) {
      void showAppToast({ title: '请输入 JSON 或片单 URL', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      const result = await importTvKeepPlaylist(value);
      void showAppToast({
        title: '导入完成',
        description: `新增 ${result.added}，跳过 ${result.skipped}，失败 ${result.failed}`,
        variant: 'success',
      });
      if (result.errors.length) console.warn('[tv-keep-import]', result.errors);
      props.onOpenChange(false);
      setText('');
      props.onDone?.();
    } catch (e) {
      void showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
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
        void showAppToast({ title: '文件为空', variant: 'warning' });
        return;
      }
      setText(content);
    } catch (e) {
      if (isUserCancelled(e)) return;
      void showAppToast({
        title: '读取文件失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>导入片单</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody>
          <div class="space-y-3 px-1 py-2">
            <Label>JSON 内容或片单 URL</Label>
            <AppTextField>
              <AppTextFieldTextArea
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
                placeholder='粘贴片单 JSON，或 https://…/playlist.json'
                class="min-h-32"
              />
            </AppTextField>
            <Button type="button" variant="outline" size="sm" onClick={() => void handlePickFile()}>
              <FileTextIcon class="mr-1.5 h-4 w-4" />
              选择文件
            </Button>
          </div>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={busy() || !text().trim()} onClick={() => void handleImport()}>
            导入
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
