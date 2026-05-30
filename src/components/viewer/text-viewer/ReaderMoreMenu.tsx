/**
 * 阅读器「更多」菜单（对齐 Legado book_read 溢出项子集）
 */

import { Show } from 'solid-js';
import { readerStore } from '@/stores/reader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface ReaderMoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSearch: () => void;
  onOpenBookmarks: () => void;
  onAddBookmark: () => void;
  canBookmark: boolean;
}

export function ReaderMoreMenu(props: ReaderMoreMenuProps) {
  const replaceEnabled = () => readerStore.isUseReplaceRule();

  const handleToggleReplace = async (enabled: boolean) => {
    try {
      await readerStore.setUseReplaceRule(enabled);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppDrawer open={props.open} onOpenChange={props.onOpenChange} snapPoints={[0, 1]} defaultSnapPoint={1}>
      <AppDrawerContent
        class={cn('z-100 flex flex-col', hDrawerPanel, 'max-h-[75dvh]')}
        overlayClass="z-100"
        showNativeDragHandle={false}
      >
        <AppDrawerHeader title="更多" />
        <AppDrawerBody class="gap-1 px-2 pb-6">
          <Button
            variant="ghost"
            class="w-full justify-start"
            onClick={() => {
              props.onOpenChange(false);
              props.onOpenSearch();
            }}
          >
            全书搜索
          </Button>
          <Show when={props.canBookmark}>
            <Button
              variant="ghost"
              class="w-full justify-start"
              onClick={() => {
                props.onOpenChange(false);
                props.onAddBookmark();
              }}
            >
              添加书签
            </Button>
            <Button
              variant="ghost"
              class="w-full justify-start"
              onClick={() => {
                props.onOpenChange(false);
                props.onOpenBookmarks();
              }}
            >
              本书书签
            </Button>
          </Show>
          <div class="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
            <Label class="text-sm">启用替换净化</Label>
            <Switch
              checked={replaceEnabled()}
              onChange={handleToggleReplace}
            >
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
              <SwitchLabel class="sr-only">启用替换净化</SwitchLabel>
            </Switch>
          </div>
          <AppDrawerClose as="button" class="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted">
            关闭
          </AppDrawerClose>
        </AppDrawerBody>
      </AppDrawerContent>
    </AppDrawer>
  );
}
