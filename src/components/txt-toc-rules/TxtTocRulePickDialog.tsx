/**
 * 单书 TXT 目录规则选择（对齐 Legado TxtTocRuleDialog）
 */

import { createSignal, createEffect, For, Show } from 'solid-js';
import * as txtTocDb from '@/lib/database/txt-toc-rules';
import {
  encodeTocRuleStorage,
  matchTxtTocRuleByStorage,
  countTxtTocRuleMatches,
} from '@/lib/local-book/txt-toc-rule-engine';
import { filterTxtTocRules } from '@/lib/txt-toc-rules/filter-txt-toc-rules';
import {
  AppDialog,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { cn } from '@/lib/utils';
import type { TxtTocRule } from '@/types';

export interface TxtTocRulePickResult {
  tocRuleStorage: string;
  splitLongChapter: boolean;
}

export interface TxtTocRulePickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前书籍 tocUrl 中的规则存储串 */
  currentTocUrl?: string;
  /** 用于预览匹配章数的文本样本（通常为书籍前 512KB） */
  sampleText?: string;
  /** 当前是否拆分超长章节 */
  splitLongChapter?: boolean;
  /** 确认后返回规则与拆分选项 */
  onConfirm: (result: TxtTocRulePickResult) => void | Promise<void>;
}

const SAMPLE_SIZE = 512_000;

export function TxtTocRulePickDialog(props: TxtTocRulePickDialogProps) {
  const [rules, setRules] = createSignal<TxtTocRule[]>([]);
  const [search, setSearch] = createSignal('');
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [previewCounts, setPreviewCounts] = createSignal<Record<number, number>>({});
  const [loading, setLoading] = createSignal(false);
  const [splitLongChapter, setSplitLongChapter] = createSignal(true);
  const filtered = () => filterTxtTocRules(rules(), search());

  createEffect(async () => {
    if (!props.open) return;
    setSplitLongChapter(props.splitLongChapter !== false);
    setLoading(true);
    try {
      const all = await txtTocDb.getAllTxtTocRules();
      setRules(all);
      const matched = matchTxtTocRuleByStorage(props.currentTocUrl, all);
      setSelectedId(matched?.id ?? all.find((r) => r.enable && r.rule.trim())?.id ?? null);
    } finally {
      setLoading(false);
    }
  });

  createEffect(() => {
    const text = props.sampleText;
    if (!props.open || !text) return;
    void previewRules(text, filtered());
  });

  async function previewRules(text: string, list: TxtTocRule[]) {
    const sample = text.slice(0, SAMPLE_SIZE);
    const counts: Record<number, number> = {};
    for (const rule of list) {
      if (!rule.rule.trim()) continue;
      counts[rule.id] = await countTxtTocRuleMatches(sample, rule);
    }
    setPreviewCounts(counts);
  }

  const handleConfirm = async () => {
    const id = selectedId();
    const rule = rules().find((r) => r.id === id);
    if (!rule) return;
    const storage = encodeTocRuleStorage(rule.rule, rule.replacement);
    await props.onConfirm({ tocRuleStorage: storage, splitLongChapter: splitLongChapter() });
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="flex max-w-lg flex-col gap-3 sm:max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>TXT 目录规则</AppDialogTitle>
        </AppDialogHeader>

        <p class="text-xs text-muted-foreground">
          选择用于本书分章的目录规则。确认后将重新解析章节列表（仅对当前书籍生效）。
        </p>

        <TextField>
          <TextFieldInput
            placeholder="搜索规则名称或示例"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </TextField>

        <div class="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <span class="text-sm">拆分超长章节</span>
          <AppSwitch checked={splitLongChapter()} onChange={(v) => setSplitLongChapter(!!v)}>
            <AppSwitchControl>
              <AppSwitchLabel class="sr-only">拆分超长章节</AppSwitchLabel>
              <AppSwitchThumb />
            </AppSwitchControl>
          </AppSwitch>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60">
          <Show when={!loading()} fallback={<p class="p-4 text-sm text-muted-foreground">加载中…</p>}>
            <ul>
              <For each={filtered()}>
                {(rule) => {
                  const selected = () => selectedId() === rule.id;
                  const preview = () => previewCounts()[rule.id];
                  const subtitle = () =>
                    rule.example?.trim() || rule.rule.trim() || '（空规则：按固定长度分章）';
                  return (
                    <li class="border-b border-border/40 last:border-b-0">
                      <button
                        type="button"
                        class={cn(
                          'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
                          'hover:bg-accent/30',
                          selected() && 'bg-accent/25',
                        )}
                        onClick={() => setSelectedId(rule.id)}
                      >
                        <span
                          class={cn(
                            'mt-1 h-4 w-4 shrink-0 rounded-full border-2',
                            selected() ? 'border-primary bg-primary' : 'border-muted-foreground/50',
                          )}
                          aria-hidden
                        />
                        <span class="min-w-0 flex-1">
                          <span class="flex items-center gap-2">
                            <TruncatedTooltip
                              as="span"
                              text={rule.name}
                              class="truncate font-medium"
                            />
                            <Show when={preview() != null && rule.rule.trim()}>
                              <span class="shrink-0 text-xs text-muted-foreground">
                                约 {preview()} 章
                              </span>
                            </Show>
                          </span>
                          <TruncatedTooltip
                            as="span"
                            text={subtitle()}
                            class="mt-0.5 block truncate text-xs text-muted-foreground"
                          />
                        </span>
                      </button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>

        <AppDialogFooter class="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={selectedId() == null}>
            确认并重新分章
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
