/**
 * 订阅分类挑选：批量移动 / 加入 / 创建分类
 */

import { For, Show, createEffect, createSignal, type Component } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { AppTextFieldInput } from '@/components/shared/AppTextField';
import { FolderPlusIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export type SubscribeCategoryPickMode = 'move' | 'join';

export interface SubscribeCategoryPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SubscribeCategoryPickMode;
  categories: string[];
  /** 选中源数量，用于文案 */
  selectedCount: number;
  onConfirm: (category: string) => void | Promise<void>;
}

function categoryLabel(value: string) {
  return value.trim() ? value : '未分类';
}

export const SubscribeCategoryPickDialog: Component<SubscribeCategoryPickDialogProps> = (props) => {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setSelected(null);
    setCreating(false);
    setNewName('');
    setBusy(false);
  });

  const title = () => (props.mode === 'join' ? '加入到分类' : '移动至分类');
  const description = () =>
    props.mode === 'join'
      ? `将所选 ${props.selectedCount} 个源加入分类`
      : `将所选 ${props.selectedCount} 个源移动到分类`;

  const options = () => {
    const list = [...props.categories].filter((c) => c.trim());
    list.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    if (props.mode === 'move') return ['', ...list];
    return list;
  };

  async function confirm() {
    if (creating()) {
      const name = newName().trim();
      if (!name) return;
      setBusy(true);
      try {
        await props.onConfirm(name);
        props.onOpenChange(false);
      } finally {
        setBusy(false);
      }
      return;
    }
    const cat = selected();
    if (cat == null) return;
    setBusy(true);
    try {
      await props.onConfirm(cat);
      props.onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = () => {
    if (busy()) return false;
    if (creating()) return newName().trim().length > 0;
    return selected() != null;
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="sm:max-w-sm">
        <AppDialogHeader>
          <AppDialogTitle>{title()}</AppDialogTitle>
          <AppDialogDescription>{description()}</AppDialogDescription>
        </AppDialogHeader>

        <Show
          when={!creating()}
          fallback={
            <div class="space-y-2">
              <AppTextFieldInput
                layout="bare"
                class="w-full"
                placeholder="新分类名称"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') void confirm();
                }}
              />
            </div>
          }
        >
          <div class="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
            <Show when={options().length === 0}>
              <div class="px-2 py-6 text-center text-sm text-muted-foreground">暂无分类</div>
            </Show>
            <For each={options()}>
              {(category) => (
                <button
                  type="button"
                  class={cn(
                    'flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors',
                    selected() === category
                      ? 'bg-primary/15 text-foreground'
                      : 'hover:bg-muted/60',
                  )}
                  onClick={() => setSelected(category)}
                >
                  {categoryLabel(category)}
                </button>
              )}
            </For>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={() => {
                setCreating(true);
                setSelected(null);
              }}
            >
              <FolderPlusIcon class="h-4 w-4" />
              创建分类…
            </button>
          </div>
        </Show>

        <AppDialogFooter>
          <Show when={creating()}>
            <Button
              variant="outline"
              class="mr-auto"
              disabled={busy()}
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
            >
              返回
            </Button>
          </Show>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={busy()}>
            取消
          </Button>
          <Button disabled={!canConfirm()} onClick={() => void confirm()}>
            {busy() ? '处理中…' : '确定'}
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
};
