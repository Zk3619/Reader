/**
 * 搜索范围选择（对齐 Legado SearchScopeDialog）
 */

import { createSignal, createEffect, For, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { isSourceScope, scopeDisplayNames } from '@/lib/book-source/search-scope';

export interface BookSearchScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: string;
  groupNames: string[];
  onConfirm: (scope: string) => void;
}

export function BookSearchScopeDialog(props: BookSearchScopeDialogProps) {
  const [selectedGroups, setSelectedGroups] = createSignal<string[]>([]);

  createEffect(() => {
    if (!props.open) return;
    if (isSourceScope(props.scope)) {
      setSelectedGroups([]);
      return;
    }
    setSelectedGroups(scopeDisplayNames(props.scope));
  });

  const toggleGroup = (name: string) => {
    setSelectedGroups((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name],
    );
  };

  const confirm = () => {
    const groups = selectedGroups();
    props.onConfirm(groups.length > 0 ? groups.join(',') : '');
    props.onOpenChange(false);
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent class="max-w-md">
        <AppDialogHeader>
          <AppDialogTitle>搜索范围</AppDialogTitle>
          <AppDialogDescription class="text-sm text-muted-foreground">
            选择参与全网搜索的书源分组；不选表示全部启用书源。
          </AppDialogDescription>
        </AppDialogHeader>
        <Show
          when={!isSourceScope(props.scope)}
          fallback={
            <p class="px-6 pb-4 text-sm text-muted-foreground">
              当前为单书源搜索，范围由入口指定。
            </p>
          }
        >
          <div class="max-h-[min(20rem,50vh)] overflow-y-auto px-6 pb-2">
            <label class="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/40">
              <Checkbox
                checked={selectedGroups().length === 0}
                onChange={() => setSelectedGroups([])}
                aria-label="全部书源"
              />
              <span>全部书源</span>
            </label>
            <For each={props.groupNames}>
              {(name) => (
                <label class="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/40">
                  <Checkbox
                    checked={selectedGroups().includes(name)}
                    onChange={() => toggleGroup(name)}
                    aria-label={name}
                  />
                  <span class="min-w-0 truncate">{name}</span>
                </label>
              )}
            </For>
            <Show when={props.groupNames.length === 0}>
              <p class="px-2 py-3 text-sm text-muted-foreground">暂无书源分组</p>
            </Show>
          </div>
          <div class="flex justify-end gap-2 border-t border-border/50 px-6 py-4">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={confirm}>确定</Button>
          </div>
        </Show>
      </AppDialogContent>
    </AppDialog>
  );
}
