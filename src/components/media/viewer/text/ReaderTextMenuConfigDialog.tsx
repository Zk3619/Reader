/**
 * 文本选择菜单项配置（对齐 Legado TextMenuConfigDialog）
 */

import { createSignal, For } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { Label } from '@/components/ui/label';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import {
  defaultTextMenuVisibleItemIds,
  normalizeTextMenuVisibleItemSet,
} from '@/lib/media/text/reader-text-menu-config';
import {
  TEXT_VIEWER_TEXT_MENU_ITEM_IDS,
  TEXT_VIEWER_TEXT_MENU_ITEM_LABELS,
  type TextViewerTextMenuItemId,
} from '@/lib/media/text/reader-ui-config';
import { ReaderProcessTextMenuConfigDialog } from '@/components/media/viewer/text/ReaderProcessTextMenuConfigDialog';

export interface ReaderTextMenuConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReaderTextMenuConfigDialog(props: ReaderTextMenuConfigDialogProps) {
  const [processTextConfigOpen, setProcessTextConfigOpen] = createSignal(false);

  const visible = () =>
    normalizeTextMenuVisibleItemSet(textViewerStore.state.config.textMenuVisibleItems);

  const isVisible = (id: TextViewerTextMenuItemId) => visible().has(id);

  const toggle = (id: TextViewerTextMenuItemId, enabled: boolean) => {
    const current = new Set(visible());
    if (enabled) current.add(id);
    else current.delete(id);
    textViewerStore.setConfig({
      textMenuVisibleItems: [...current] as TextViewerTextMenuItemId[],
    });
  };

  const resetDefaults = () => {
    textViewerStore.setConfig({
      textMenuVisibleItems: defaultTextMenuVisibleItemIds(),
      textMenuHiddenProcessTextItems: [],
    });
  };

  return (
    <>
      <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
        <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-md">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>展开文本菜单配置</ViewerAppDialogTitle>
            <ViewerAppDialogDescription>
              选择选区菜单中要显示的项。折叠模式下前 5 项显示在主栏，其余在「更多」中。
            </ViewerAppDialogDescription>
          </ViewerAppDialogHeader>
          <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
            <div class="space-y-3">
              <For each={[...TEXT_VIEWER_TEXT_MENU_ITEM_IDS]}>
                {(id) => (
                  <div class="flex items-center justify-between gap-3">
                    <Label class="text-sm">{TEXT_VIEWER_TEXT_MENU_ITEM_LABELS[id]}</Label>
                    <AppSwitch checked={isVisible(id)} onChange={(v) => toggle(id, v)}>
                      <AppSwitchControl>
                        <AppSwitchThumb />
                      </AppSwitchControl>
                      <AppSwitchLabel class="sr-only">
                        {TEXT_VIEWER_TEXT_MENU_ITEM_LABELS[id]}
                      </AppSwitchLabel>
                    </AppSwitch>
                  </div>
                )}
              </For>
              <Button
                variant="outline"
                class="w-full"
                onClick={() => setProcessTextConfigOpen(true)}
              >
                其他应用菜单配置
              </Button>
              <Button variant="outline" class="w-full" onClick={resetDefaults}>
                恢复默认
              </Button>
              <Button class="w-full" onClick={() => props.onOpenChange(false)}>
                完成
              </Button>
            </div>
          </AppDialogScrollBody>
        </ViewerAppDialogContent>
      </ViewerAppDialog>
      <ReaderProcessTextMenuConfigDialog
        open={processTextConfigOpen()}
        onOpenChange={setProcessTextConfigOpen}
      />
    </>
  );
}
