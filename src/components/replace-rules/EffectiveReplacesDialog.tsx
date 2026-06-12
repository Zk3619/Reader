/**
 * 当前章生效的替换规则（对齐 Legado EffectiveReplacesDialog）
 */

import { createSignal, For, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import * as replaceDb from '@/lib/database/replace-rules';
import { invalidateReplaceRulesCache } from '@/lib/book-source/content-processor';
import {
  ReplaceRuleEditDialog,
  type ReplaceRuleDraft,
} from '@/components/replace-rules/ReplaceRuleEditDialog';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from '@/components/shared/icons';
import type { ChineseConverterType } from '@/lib/replace-rules/chinese-converter';

const CHINESE_CONVERT_RULE_ID = -1;

export interface EffectiveReplacesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalZClass?: string;
}

type EffectiveRuleItem = {
  id: number;
  name: string;
  virtual?: 'chinese-convert';
};

const CHINESE_OPTIONS: { type: ChineseConverterType; label: string }[] = [
  { type: 0, label: '关闭' },
  { type: 1, label: '繁转简' },
  { type: 2, label: '简转繁' },
];

function chineseLabel(type: ChineseConverterType): string {
  if (type === 1) return '繁简转换（繁转简）';
  if (type === 2) return '繁简转换（简转繁）';
  return '繁简转换（关闭）';
}

export function EffectiveReplacesDialog(props: EffectiveReplacesDialogProps) {
  const [editOpen, setEditOpen] = createSignal(false);
  const [editingRule, setEditingRule] = createSignal<ReplaceRuleDraft | null>(null);

  const items = (): EffectiveRuleItem[] => {
    const list: EffectiveRuleItem[] = textViewerStore.state.effectiveReplaceRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
    }));
    const chineseType = textViewerStore.getChineseConverterType();
    list.push({
      id: CHINESE_CONVERT_RULE_ID,
      name: chineseLabel(chineseType),
      virtual: 'chinese-convert',
    });
    return list;
  };

  const disableItem = async (item: EffectiveRuleItem) => {
    if (item.virtual === 'chinese-convert') {
      await textViewerStore.setChineseConverterType(0);
      return;
    }
    await textViewerStore.disableEffectiveReplaceRule(item.id);
  };

  const openEdit = async (item: EffectiveRuleItem) => {
    if (item.virtual === 'chinese-convert') return;
    const rule = await replaceDb.getReplaceRuleById(item.id);
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

  const setChineseType = async (type: ChineseConverterType) => {
    await textViewerStore.setChineseConverterType(type);
  };

  return (
    <>
      <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
        <AppDialogContent
          portalToBody
          portalZClass={props.portalZClass}
          class="flex max-h-[70dvh] max-w-md flex-col overflow-hidden"
        >
          <AppDialogHeader>
            <AppDialogTitle>生效的替换规则</AppDialogTitle>
          </AppDialogHeader>

          <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            <Show
              when={items().length > 0}
              fallback={
                <p class="py-6 text-center text-sm text-muted-foreground">
                  当前章节没有命中替换规则（仍可调整繁简转换）
                </p>
              }
            >
              <ul class="divide-y divide-border">
                <For each={items()}>
                  {(item) => (
                    <li class="flex items-center gap-2 py-3">
                      <Show
                        when={item.virtual === 'chinese-convert'}
                        fallback={
                          <button
                            type="button"
                            class="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
                            onClick={() => void openEdit(item)}
                          >
                            {item.name}
                          </button>
                        }
                      >
                        <AppDropdownMenu>
                          <AppDropdownMenuTrigger
                            as={(p: Record<string, unknown>) => (
                              <button
                                type="button"
                                class="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-sm hover:text-primary"
                                {...p}
                              >
                                <span class="truncate">{item.name}</span>
                                <ChevronDownIcon class="h-3.5 w-3.5 shrink-0 opacity-60" />
                              </button>
                            )}
                          />
                          <AppDropdownMenuContent layout="compact">
                            <For each={CHINESE_OPTIONS}>
                              {(opt) => (
                                <AppDropdownMenuItem
                                  class={
                                    textViewerStore.getChineseConverterType() === opt.type
                                      ? 'bg-accent/50'
                                      : undefined
                                  }
                                  onSelect={() => void setChineseType(opt.type)}
                                >
                                  {opt.label}
                                </AppDropdownMenuItem>
                              )}
                            </For>
                          </AppDropdownMenuContent>
                        </AppDropdownMenu>
                      </Show>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="shrink-0 text-muted-foreground"
                        onClick={() => void disableItem(item)}
                      >
                        禁用
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div class="border-t border-border px-6 py-4">
            <Button variant="outline" class="w-full" onClick={() => props.onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </AppDialogContent>
      </AppDialog>

      <ReplaceRuleEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        rule={editingRule()}
        onSave={saveRule}
      />
    </>
  );
}
