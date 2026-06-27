/**
 * 文本选择菜单项配置（对齐 Legado TextMenuConfigDialog）
 */

import { For } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import {
  TEXT_VIEWER_TEXT_MENU_ITEM_IDS,
  TEXT_VIEWER_TEXT_MENU_ITEM_LABELS,
  type TextViewerTextMenuItemId,
} from '@/lib/media/text/reader-ui-config';

export interface ReaderTextMenuConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReaderTextMenuConfigDialog(props: ReaderTextMenuConfigDialogProps) {
  const visible = () =>
    new Set(textViewerStore.state.config.textMenuVisibleItems ?? []);

  const isVisible = (id: TextViewerTextMenuItemId) => visible().has(id);

  const toggle = (id: TextViewerTextMenuItemId, enabled: boolean) => {
    const current = new Set(visible());
    if (enabled) current.add(id);
    else current.delete(id);
    textViewerStore.setConfig({
      textMenuVisibleItems: [...current] as TextViewerTextMenuItemId[],
    });
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>文本菜单配置</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
          <div class="space-y-3">
            <For each={[...TEXT_VIEWER_TEXT_MENU_ITEM_IDS]}>
              {(id) => (
                <div class="flex items-center justify-between gap-3">
                  <Label class="text-sm">{TEXT_VIEWER_TEXT_MENU_ITEM_LABELS[id]}</Label>
                  <Switch
                    checked={isVisible(id)}
                    onChange={(v) => toggle(id, v)}
                  >
                    <SwitchControl>
                      <SwitchThumb />
                    </SwitchControl>
                    <SwitchLabel class="sr-only">{TEXT_VIEWER_TEXT_MENU_ITEM_LABELS[id]}</SwitchLabel>
                  </Switch>
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
