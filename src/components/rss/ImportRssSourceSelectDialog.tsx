import { dialogScrollFrameFlex, appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
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
import { AppCombobox } from '@/components/shared/AppCombobox';
import type { ImportRssSourceComparison } from '@/lib/book-source/import-rss-resolver';
import { cn } from '@/lib/utils';
import type { NewRssSource } from '@/types';

export interface ImportRssSourceSelectDialogProps {
  open: boolean;
  loading: boolean;
  sources: NewRssSource[];
  comparisons: ImportRssSourceComparison[];
  selectedUrls: Set<string>;
  keepName: boolean;
  keepGroup: boolean;
  keepEnable: boolean;
  groupName: string;
  groupOptions: string[];
  adjustGroup: boolean;
  portalZClass?: string;
  onOpenChange: (open: boolean) => void;
  onToggle: (sourceUrl: string, checked: boolean) => void;
  onSelectAllToggle: () => void;
  onInvertSelect: () => void;
  onSelectNewToggle: () => void;
  onSelectUpdateToggle: () => void;
  onKeepNameChange: (v: boolean) => void;
  onKeepGroupChange: (v: boolean) => void;
  onKeepEnableChange: (v: boolean) => void;
  onGroupNameChange: (v: string) => void;
  onAdjustGroupChange: (v: boolean) => void;
  onConfirm: () => void;
}

function OptionCheckRow(props: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      class="flex cursor-pointer select-none items-center gap-2 text-sm"
      onClick={() => props.onChange(!props.checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onChange(!props.checked);
        }
      }}
    >
      <Checkbox checked={props.checked} class="pointer-events-none" />
      {props.label}
    </div>
  );
}

export function ImportRssSourceSelectDialog(props: ImportRssSourceSelectDialogProps) {
  const allSelected = () =>
    props.sources.length > 0 && props.selectedUrls.size === props.sources.length;
  const selectedCountText = () => `(${props.selectedUrls.size}/${props.sources.length})`;

  const comparisonByUrl = () => {
    const map = new Map<string, ImportRssSourceComparison>();
    for (const c of props.comparisons) {
      map.set(c.source.sourceUrl, c);
    }
    return map;
  };

  const statusLabel = (url: string) => {
    const c = comparisonByUrl().get(url);
    if (!c) return null;
    if (c.isNew) return '新';
    if (c.isUpdate) return '更新';
    return '已有';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>导入订阅源</AppDialogTitle>
          <AppDialogDescription>
            默认勾选新增或远程更新时间更晚的订阅源。可保留本地名称、分组与启用状态。
          </AppDialogDescription>
        </AppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class={appDialogScrollBodySpaceY3}>
          <Show when={!props.loading}>
            <section class="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
              <p class="text-xs font-medium text-muted-foreground">导入选项</p>
              <div class="flex flex-wrap gap-x-4 gap-y-2">
                <OptionCheckRow
                  checked={props.keepName}
                  label="保留名称"
                  onChange={props.onKeepNameChange}
                />
                <OptionCheckRow
                  checked={props.keepGroup}
                  label="保留分组"
                  onChange={props.onKeepGroupChange}
                />
                <OptionCheckRow
                  checked={props.keepEnable}
                  label="保留启用"
                  onChange={props.onKeepEnableChange}
                />
              </div>
              <div class="flex flex-wrap items-end gap-2">
                <AppCombobox
                  class="min-w-48 flex-1"
                  options={props.groupOptions}
                  value={props.groupName}
                  onChange={props.onGroupNameChange}
                  placeholder="导入分组（可选）"
                  aria-label="导入分组"
                  contentClass={
                    props.portalZClass ? cn(props.portalZClass, 'z-[170]') : undefined
                  }
                />
                <div class="pb-2">
                  <OptionCheckRow
                    checked={props.adjustGroup}
                    label="调整分组"
                    onChange={props.onAdjustGroupChange}
                  />
                </div>
              </div>
            </section>
          </Show>
          <Show
            when={!props.loading}
            fallback={
              <div class="flex min-h-40 items-center justify-center rounded-lg border border-border/50 bg-muted/20">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            }
          >
            <Show
              when={props.sources.length > 0}
              fallback={<p class="text-sm text-muted-foreground">未识别到有效订阅源</p>}
            >
              <div class="space-y-3">
                <For each={props.sources}>
                  {(source) => {
                    const checked = () => props.selectedUrls.has(source.sourceUrl);
                    const tag = statusLabel(source.sourceUrl);
                    const toggle = () => props.onToggle(source.sourceUrl, !checked());
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
                          <div class="flex items-center gap-2">
                            <span class="block truncate text-sm font-medium">
                              {source.sourceName}
                            </span>
                            <Show when={tag}>
                              <span
                                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                classList={{
                                  'bg-primary/15 text-primary': tag === '新',
                                  'bg-amber-500/15 text-amber-700 dark:text-amber-400': tag === '更新',
                                  'bg-muted text-muted-foreground': tag === '已有',
                                }}
                              >
                                {tag}
                              </span>
                            </Show>
                          </div>
                          <span class="block truncate text-xs text-muted-foreground">
                            {source.sourceUrl}
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
          <Button variant="outline" onClick={props.onSelectAllToggle} disabled={props.loading || props.sources.length === 0}>
            {allSelected() ? '取消选中' : '全选'} {selectedCountText()}
          </Button>
          <Button variant="outline" onClick={props.onInvertSelect} disabled={props.loading || props.sources.length === 0}>
            反选
          </Button>
          <Button variant="outline" onClick={props.onSelectNewToggle} disabled={props.loading || props.sources.length === 0}>
            勾选新增
          </Button>
          <Button variant="outline" onClick={props.onSelectUpdateToggle} disabled={props.loading || props.sources.length === 0}>
            勾选更新
          </Button>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
              取消
            </Button>
            <Button
              onClick={props.onConfirm}
              disabled={props.loading || props.selectedUrls.size === 0}
            >
              确定
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
