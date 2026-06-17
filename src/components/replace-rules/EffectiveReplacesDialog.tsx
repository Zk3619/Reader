import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
/**
 * 当前章生效的替换规则（对齐 Legado EffectiveReplacesDialog）
 */

import { createSignal, For, onCleanup, onMount, Show, createEffect } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import * as replaceDb from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import {
  ReplaceRuleEditDialog,
  type ReplaceRuleDraft,
} from '@/components/replace-rules/ReplaceRuleEditDialog';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { VIEWER_SHELL_OVERLAY_EVENTS } from '@/lib/ui/overlay-cleanup';

export interface EffectiveReplacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 阅读器叠层是否栈顶可见；不可见时强制关闭 */
  shellActive?: boolean;
}

export function EffectiveReplacesDialog(props: EffectiveReplacesDialogProps) {
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<ReplaceRuleDraft | null>(null);

  const closeAll = () => {
    props.onOpenChange(false);
    setEditOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      setEditOpen(false);
    }
  };

  onMount(() => {
    const onShellClose = () => closeAll();
    window.addEventListener(VIEWER_SHELL_OVERLAY_EVENTS.CLOSE_ALL, onShellClose);
    onCleanup(() => {
      window.removeEventListener(VIEWER_SHELL_OVERLAY_EVENTS.CLOSE_ALL, onShellClose);
    });
  });

  createEffect(() => {
    if (props.shellActive !== false) return;
    closeAll();
  });

  onCleanup(() => {
    props.onOpenChange(false);
    setEditOpen(false);
  });

  const items = () => textViewerStore.state.effectiveReplaceRules;

  const disableItem = async (id: number) => {
    await textViewerStore.disableEffectiveReplaceRule(id);
  };

  const openEdit = async (id: number) => {
    const rule = await replaceDb.getReplaceRuleById(id);
    if (!rule) return;
    setEditingRule({ ...rule });
    setEditOpen(true);
  };

  const saveRule = async (rule: ReplaceRuleDraft) => {
    if (!('id' in rule) || !rule.id) return;
    await replaceDb.updateReplaceRule(rule as import('@/types').ReplaceRule);
    invalidateReplaceRulesCache();
    await textViewerStore.reprocessDisplayedChapter();
    setEditOpen(false);
  };

  return (
    <>
      <ViewerAppDialog open={props.open} onOpenChange={handleOpenChange} modal={false}>
        <ViewerAppDialogContent class="flex max-w-md flex-col overflow-hidden">
          <ViewerAppDialogHeader>
            <ViewerAppDialogTitle>生效的替换规则</ViewerAppDialogTitle>
          </ViewerAppDialogHeader>

          <AppDialogScrollBody frameClass={dialogScrollFrameFlex}>
            <Show
              when={items().length > 0}
              fallback={
                <p class="py-6 text-center text-sm text-muted-foreground">
                  当前章节没有命中替换规则
                </p>
              }
            >
              <ul class="divide-y divide-border">
                <For each={items()}>
                  {(item) => (
                    <li class="flex items-center gap-2 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        class="min-w-0 flex-1 justify-start truncate px-0 text-left font-normal hover:text-primary"
                        onClick={() => void openEdit(item.id)}
                      >
                        {item.name}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="shrink-0 text-muted-foreground"
                        onClick={() => void disableItem(item.id)}
                      >
                        禁用
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </AppDialogScrollBody>

          <div class="border-t border-border px-6 py-4">
            <Button variant="outline" class="w-full" onClick={() => handleOpenChange(false)}>
              关闭
            </Button>
          </div>
        </ViewerAppDialogContent>
      </ViewerAppDialog>

      <ReplaceRuleEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        rule={editingRule()}
        onSave={saveRule}
        overlayLayer="viewer-stacked"
      />
    </>
  );
}
