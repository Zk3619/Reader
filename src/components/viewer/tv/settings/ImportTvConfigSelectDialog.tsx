/**
 * 影视源导入选择弹窗（单一源库，对齐音源）
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
import type { IdentifiedTvConfig } from '@/lib/media/tv/config/tv-config-import-identify';
import type { ImportTvConfigComparison } from '@/lib/media/tv/config/tv-config-import-compare';

export interface ImportTvConfigSelectDialogProps {
  open: boolean;
  loading: boolean;
  loadingMessage?: string;
  sources: IdentifiedTvConfig[];
  comparisons: ImportTvConfigComparison[];
  selectedKeys: Set<string>;
  onOpenChange: (open: boolean) => void;
  onToggle: (key: string, checked: boolean) => void;
  onSelectAllToggle: () => void;
  onInvertSelect: () => void;
  onSelectNewToggle: () => void;
  onSelectUpdateToggle: () => void;
  onConfirm: () => void;
}

export function ImportTvConfigSelectDialog(props: ImportTvConfigSelectDialogProps) {
  const allSelected = () =>
    props.comparisons.length > 0 &&
    props.selectedKeys.size === props.comparisons.length;
  const selectedCountText = () =>
    `(${props.selectedKeys.size}/${props.comparisons.length})`;

  const comparisonByKey = () => {
    const map = new Map<string, ImportTvConfigComparison>();
    for (const c of props.comparisons) map.set(c.key, c);
    return map;
  };

  const statusLabel = (key: string) => {
    const c = comparisonByKey().get(key);
    if (!c) return null;
    if (c.isNew) return '新';
    if (c.isUpdate) return '更新';
    return '已有';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody>
        <AppDialogHeader>
          <AppDialogTitle>导入影视源</AppDialogTitle>
          <AppDialogDescription>
            默认勾选新增或可更新的配置。内容相同标记为「已有」。导入后可在下方分别选择影视 / 直播使用的源。
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
              when={props.comparisons.length > 0}
              fallback={
                <p class="py-8 text-center text-sm text-muted-foreground">未识别到可导入配置</p>
              }
            >
              <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectAllToggle()}>
                  {allSelected() ? '取消全选' : '全选'}
                  {selectedCountText()}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => props.onInvertSelect()}>
                  反选
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectNewToggle()}>
                  仅新
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectUpdateToggle()}>
                  仅更新
                </Button>
              </div>
              <ul class="space-y-2">
                <For each={props.comparisons}>
                  {(c) => {
                    const checked = () => props.selectedKeys.has(c.key);
                    const status = () => statusLabel(c.key);
                    const toggle = () => props.onToggle(c.key, !checked());
                    return (
                      <li
                        class="flex cursor-pointer items-start gap-3 rounded-lg border border-border/50 bg-muted/10 px-3 py-2"
                        role="button"
                        tabindex={0}
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                      >
                        <Checkbox checked={checked()} class="pointer-events-none mt-1" />
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="truncate text-sm font-medium">{c.source.name}</p>
                            <Show when={status()}>
                              <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {status()}
                              </span>
                            </Show>
                          </div>
                          <p class="truncate text-[11px] text-muted-foreground">{c.source.url}</p>
                          <p class="text-[11px] text-muted-foreground">
                            站点 {c.source.siteCount} · 直播 {c.source.liveCount}
                            {c.existing ? ` · 覆盖「${c.existing.name}」` : ''}
                          </p>
                        </div>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </Show>
        </AppDialogScrollBody>
        <AppDialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={props.loading || props.selectedKeys.size === 0}
            onClick={() => props.onConfirm()}
          >
            导入所选
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
