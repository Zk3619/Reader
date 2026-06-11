/**
 * 阅读器查词对话框（对齐 Legado DictDialog）
 */

import { createEffect, createSignal, For, Show } from 'solid-js';
import type { DictRule } from '@/types';
import { getEnabledDictRules } from '@/lib/database/dict-rules';
import { searchDictRule } from '@/lib/dict/dict-rule-search';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { LoaderIcon } from '@/components/shared/icons';

export interface DictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word: string;
}

export function DictDialog(props: DictDialogProps) {
  const [rules, setRules] = createSignal<DictRule[]>([]);
  const [activeTab, setActiveTab] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [resultHtml, setResultHtml] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  const loadRules = async () => {
    const enabled = await getEnabledDictRules();
    setRules(enabled);
    if (enabled.length > 0 && !activeTab()) {
      setActiveTab(enabled[0].name);
    }
  };

  const lookup = async (ruleName: string) => {
    const rule = rules().find((r) => r.name === ruleName);
    const word = props.word.trim();
    if (!rule || !word) return;
    setLoading(true);
    setError(null);
    setResultHtml('');
    try {
      const html = await searchDictRule(rule, word);
      setResultHtml(html || '未查询到结果');
    } catch (e) {
      setError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (!props.open) return;
    void loadRules();
  });

  createEffect(() => {
    if (!props.open) return;
    const tab = activeTab();
    if (tab) void lookup(tab);
  });

  createEffect(() => {
    if (!props.open) return;
    props.word;
    const tab = activeTab();
    if (tab) void lookup(tab);
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="flex max-h-[85dvh] max-w-2xl flex-col overflow-hidden">
        <AppDialogHeader>
          <AppDialogTitle>字典：{props.word || '（未选词）'}</AppDialogTitle>
        </AppDialogHeader>
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 pb-6">
          <Show
            when={rules().length > 0}
            fallback={<p class="text-sm text-muted-foreground">暂无启用的字典规则，请在设置中配置。</p>}
          >
            <Tabs value={activeTab()} onChange={setActiveTab} class="flex min-h-0 flex-1 flex-col">
              <TabsList class="flex h-auto w-full flex-wrap gap-1 p-1">
                <For each={rules()}>
                  {(rule) => (
                    <TabsTrigger value={rule.name} class="text-sm">
                      {rule.name}
                    </TabsTrigger>
                  )}
                </For>
              </TabsList>
              <For each={rules()}>
                {(rule) => (
                  <TabsContent value={rule.name} class="mt-3 min-h-0 flex-1 overflow-y-auto">
                    <Show when={loading()}>
                      <div class="flex items-center gap-2 text-sm text-muted-foreground">
                        <LoaderIcon class="h-4 w-4 animate-spin" />
                        查询中…
                      </div>
                    </Show>
                    <Show when={error()}>
                      <p class="text-sm text-destructive">{error()}</p>
                    </Show>
                    <Show when={!loading() && !error()}>
                      <div
                        class="prose prose-sm dark:prose-invert max-w-none break-words"
                        innerHTML={resultHtml()}
                      />
                    </Show>
                  </TabsContent>
                )}
              </For>
            </Tabs>
          </Show>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
