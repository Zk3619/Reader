/**
 * 其他应用菜单配置（对齐 Legado ProcessTextConfigContent / hiddenProcessTextItems）
 */

import { For } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Label } from '@/components/ui/label';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import {
  TEXT_VIEWER_PROCESS_TEXT_APPS,
  normalizeTextMenuHiddenProcessTextItems,
} from '@/lib/media/text/reader-text-menu-config';

export interface ReaderProcessTextMenuConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReaderProcessTextMenuConfigDialog(props: ReaderProcessTextMenuConfigDialogProps) {
  const hidden = () =>
    new Set(
      normalizeTextMenuHiddenProcessTextItems(
        textViewerStore.state.config.textMenuHiddenProcessTextItems,
      ),
    );

  const isVisible = (key: string) => !hidden().has(key);

  const toggle = (key: string, enabled: boolean) => {
    const current = new Set(hidden());
    if (enabled) current.delete(key);
    else current.add(key);
    textViewerStore.setConfig({
      textMenuHiddenProcessTextItems: [...current],
    });
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>其他应用菜单配置</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            选择在「更多」菜单中显示的第三方文本处理项（Web 端以浏览器打开对应搜索页）。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
          <div class="space-y-3">
            <For each={TEXT_VIEWER_PROCESS_TEXT_APPS}>
              {(app) => (
                <div class="flex items-center justify-between gap-3">
                  <Label class="text-sm">{app.label}</Label>
                  <AppSwitch checked={isVisible(app.key)} onChange={(v) => toggle(app.key, v)}>
                    <AppSwitchControl>
                      <AppSwitchThumb />
                    </AppSwitchControl>
                    <AppSwitchLabel class="sr-only">{app.label}</AppSwitchLabel>
                  </AppSwitch>
                </div>
              )}
            </For>
            <Button class="w-full" onClick={() => props.onOpenChange(false)}>
              完成
            </Button>
          </div>
        </AppDialogScrollBody>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}
