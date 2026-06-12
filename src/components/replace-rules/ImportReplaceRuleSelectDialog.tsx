import { For, Show } from 'solid-js';
import {
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
import type { ImportReplaceRuleComparison } from '@/lib/book-source/import-replace-rule-compare';
import { cn } from '@/lib/utils';

export interface ImportReplaceRuleSelectDialogProps {
  open: boolean;
  loading: boolean;
  comparisons: ImportReplaceRuleComparison[];
  selectedKeys: Set<string>;
  keepGroup: boolean;
  keepEnable: boolean;
  groupName: string;
  groupOptions: string[];
  adjustGroup: boolean;
  portalZClass?: string;
  onOpenChange: (open: boolean) => void;
  onToggle: (key: string, checked: boolean) => void;
  onSelectAllToggle: () => void;
  onInvertSelect: () => void;
  onSelectNewToggle: () => void;
  onSelectUpdateToggle: () => void;
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

export function ImportReplaceRuleSelectDialog(props: ImportReplaceRuleSelectDialogProps) {
  const allSelected = () =>
    props.comparisons.length > 0 && props.selectedKeys.size === props.comparisons.length;
  const selectedCountText = () => `(${props.selectedKeys.size}/${props.comparisons.length})`;

  const statusLabel = (c: ImportReplaceRuleComparison) => {
    if (c.isNew) return '新';
    if (c.isUpdate) return '更新';
    return '已有';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody portalZClass={props.portalZClass} class="max-h-[min(90vh,720px)]">
        <AppDialogHeader>
          <AppDialogTitle>导入替换规则</AppDialogTitle>
          <AppDialogDescription>
            默认勾选新增或内容有变化的规则。更新已有规则时可保留本地分组与启用状态。
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 contain-layout">
          <Show when={!props.loading}>
            <section class="mb-3 space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
              <p class="text-xs font-medium text-muted-foreground">导入选项</p>
              <div class="flex flex-wrap gap-x-4 gap-y-2">
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
              when={props.comparisons.length > 0}
              fallback={<p class="text-sm text-muted-foreground">未识别到有效替换规则</p>}
            >
              <div class="space-y-3">
                <For each={props.comparisons}>
                  {(comparison) => {
                    const checked = () => props.selectedKeys.has(comparison.key);
                    const tag = statusLabel(comparison);
                    const toggle = () => props.onToggle(comparison.key, !checked());
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
                              {comparison.item.rule.name}
                            </span>
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
                          </div>
                          <span class="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                            {comparison.item.rule.pattern}
                          </span>
                          <Show when={comparison.item.rule.group?.trim()}>
                            <span class="mt-0.5 block truncate text-xs text-muted-foreground">
                              分组：{comparison.item.rule.group}
                            </span>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </div>
        <AppDialogFooter class="w-full flex-wrap items-center justify-start gap-2 sm:justify-start!">
          <Button
            variant="outline"
            onClick={props.onSelectAllToggle}
            disabled={props.loading || props.comparisons.length === 0}
          >
            {allSelected() ? '取消选中' : '全选'} {selectedCountText()}
          </Button>
          <Button
            variant="outline"
            onClick={props.onInvertSelect}
            disabled={props.loading || props.comparisons.length === 0}
          >
            反选
          </Button>
          <Button
            variant="outline"
            onClick={props.onSelectNewToggle}
            disabled={props.loading || props.comparisons.length === 0}
          >
            勾选新增
          </Button>
          <Button
            variant="outline"
            onClick={props.onSelectUpdateToggle}
            disabled={props.loading || props.comparisons.length === 0}
          >
            勾选更新
          </Button>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
              取消
            </Button>
            <Button
              onClick={props.onConfirm}
              disabled={props.loading || props.selectedKeys.size === 0}
            >
              确定
            </Button>
          </div>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
