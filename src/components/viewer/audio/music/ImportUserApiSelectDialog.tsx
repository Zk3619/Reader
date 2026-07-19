/**
 * 自定义音源识别结果选择弹窗（对齐书源导入确认流程）
 */

import { For, Show } from 'solid-js';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { dialogScrollFrameFlex, appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
import type { IdentifiedUserApiScript } from '@/lib/media/audio/online/user-api-import-identify';
import type { ImportUserApiComparison } from '@/lib/media/audio/online/user-api-import-compare';

export interface ImportUserApiSelectDialogProps {
  open: boolean;
  loading: boolean;
  loadingMessage?: string;
  sources: IdentifiedUserApiScript[];
  comparisons: ImportUserApiComparison[];
  selectedIds: Set<string>;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string, checked: boolean) => void;
  onSelectAllToggle: () => void;
  onInvertSelect: () => void;
  onSelectNewToggle: () => void;
  onSelectUpdateToggle: () => void;
  onConfirm: () => void;
}

function formatVersion(version?: string): string {
  const raw = version?.trim();
  if (!raw) return '';
  return /^\d/.test(raw) ? `v${raw}` : raw;
}

export function ImportUserApiSelectDialog(props: ImportUserApiSelectDialogProps) {
  const allSelected = () =>
    props.sources.length > 0 && props.selectedIds.size === props.sources.length;
  const selectedCountText = () => `(${props.selectedIds.size}/${props.sources.length})`;

  const comparisonById = () => {
    const map = new Map<string, ImportUserApiComparison>();
    for (const c of props.comparisons) {
      map.set(c.source.id, c);
    }
    return map;
  };

  const statusLabel = (id: string) => {
    const c = comparisonById().get(id);
    if (!c) return null;
    if (c.isNew) return '新';
    if (c.isUpdate) return '更新';
    return '已有';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody>
        <AppDialogHeader>
          <AppDialogTitle>导入自定义源</AppDialogTitle>
          <AppDialogDescription>
            默认勾选新增或可更新的源。脚本文本与本地完全相同的会标记为「已有」并默认不勾选；同名不同内容可更新覆盖。
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <Show
            when={!props.loading}
            fallback={
              <div class="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                <Show when={props.loadingMessage}>
                  <p class="text-center text-sm text-muted-foreground">{props.loadingMessage}</p>
                </Show>
              </div>
            }
          >
            <Show
              when={props.sources.length > 0}
              fallback={<p class="text-sm text-muted-foreground">未识别到有效自定义源</p>}
            >
              <div class="space-y-3">
                <For each={props.sources}>
                  {(source) => {
                    const checked = () => props.selectedIds.has(source.id);
                    const tag = () => statusLabel(source.id);
                    const toggle = () => props.onToggle(source.id, !checked());
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        class="flex cursor-pointer select-none items-start gap-2 rounded-md border border-border/70 p-3 hover:bg-muted/40"
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                      >
                        <Checkbox checked={checked()} class="pointer-events-none mt-0.5" />
                        <div class="min-w-0 flex-1">
                          <div class="flex min-w-0 flex-wrap items-center gap-2">
                            <span class="truncate text-sm font-medium">{source.name}</span>
                            <Show when={tag()}>
                              <span
                                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                classList={{
                                  'bg-primary/15 text-primary': tag() === '新',
                                  'bg-amber-500/15 text-amber-700 dark:text-amber-400':
                                    tag() === '更新',
                                  'bg-muted text-muted-foreground': tag() === '已有',
                                }}
                              >
                                {tag()}
                              </span>
                            </Show>
                            <Show when={source.version}>
                              <span class="shrink-0 text-xs text-muted-foreground">
                                {formatVersion(source.version)}
                              </span>
                            </Show>
                            <Show when={source.author}>
                              <span class="shrink-0 text-xs text-muted-foreground">
                                {source.author}
                              </span>
                            </Show>
                          </div>
                          <Show when={source.description}>
                            <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {source.description}
                            </p>
                          </Show>
                          <span class="mt-1 block truncate text-xs text-muted-foreground">
                            {source.fileName}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter class="w-full flex-wrap items-center justify-start gap-2 sm:justify-start!">
          <Button
            variant="outline"
            onClick={props.onSelectAllToggle}
            disabled={props.loading || props.sources.length === 0}
          >
            {allSelected() ? '取消选中' : '全选'} {selectedCountText()}
          </Button>
          <Button
            variant="outline"
            onClick={props.onInvertSelect}
            disabled={props.loading || props.sources.length === 0}
          >
            反选
          </Button>
          <Button
            variant="outline"
            onClick={props.onSelectNewToggle}
            disabled={props.loading || props.sources.length === 0}
          >
            勾选新增
          </Button>
          <Button
            variant="outline"
            onClick={props.onSelectUpdateToggle}
            disabled={props.loading || props.sources.length === 0}
          >
            勾选更新
          </Button>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => props.onOpenChange(false)}
              disabled={props.loading}
            >
              取消
            </Button>
            <Button
              onClick={props.onConfirm}
              disabled={props.loading || props.selectedIds.size === 0}
            >
              确定
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
