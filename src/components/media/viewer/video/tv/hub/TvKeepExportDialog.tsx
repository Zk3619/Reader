/**
 * 影视收藏缓存导出选项
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
import {
  AppManualRadioGroup,
  AppManualRadioOption,
} from '@/components/shared/AppManualRadio';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  exportTvKeepCache,
  isTvKeepExportCancelled,
  type TvKeepExportFormat,
} from '@/lib/media/tv/tv-keep-export';
import type { TvKeepRow } from '@/lib/media/tv/types';
import { showAppToast } from '@/components/shared/AppToasts';
import { appDialogSettingsShell } from '@/lib/ui/viewport-classes';

export interface TvKeepExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: () => TvKeepRow[];
  title?: string;
  description?: string;
}

export function TvKeepExportDialog(props: TvKeepExportDialogProps) {
  const [format, setFormat] = createSignal<TvKeepExportFormat>('json');
  const [busy, setBusy] = createSignal(false);

  async function handleExport() {
    const rows = props.rows();
    if (!rows.length || busy()) return;
    setBusy(true);
    try {
      const result = await exportTvKeepCache(rows, format());
      props.onOpenChange(false);
      void showAppToast({
        title: '导出完成',
        description: `${result.count} 条 · ${result.format.toUpperCase()}`,
        variant: 'success',
      });
    } catch (e) {
      if (isTvKeepExportCancelled(e)) return;
      void showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={appDialogSettingsShell}>
        <AppDialogHeader>
          <AppDialogTitle>{props.title ?? '导出片单'}</AppDialogTitle>
          <AppDialogDescription>
            {props.description ?? '导出收藏片单（站点、名称与封面；JSON 可再导入）'}
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="space-y-3 px-1 py-2">
          <Label class="text-sm font-medium">格式</Label>
          <AppManualRadioGroup class="flex flex-col gap-0.5">
            <AppManualRadioOption
              selected={format() === 'json'}
              onSelect={() => setFormat('json')}
            >
              <span>JSON（可再导入）</span>
            </AppManualRadioOption>
            <AppManualRadioOption selected={format() === 'txt'} onSelect={() => setFormat('txt')}>
              <span>文本清单</span>
            </AppManualRadioOption>
          </AppManualRadioGroup>
          <p class="text-xs text-muted-foreground">共 {props.rows().length} 条</p>
        </div>
        <AppDialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!props.rows().length || busy()}
            onClick={() => void handleExport()}
          >
            导出
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
