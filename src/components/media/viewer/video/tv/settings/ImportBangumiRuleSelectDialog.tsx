/**
 * 番剧规则导入选择弹窗（对齐 ImportTvConfigSelectDialog）
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
import { Label } from '@/components/ui/label';
import { dialogScrollFrameFlex, appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';
import type { BangumiRuleImportComparison } from '@/lib/media/video/bangumi/rule-import-identify';

export interface ImportBangumiRuleSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparisons: BangumiRuleImportComparison[];
  selectedKeys: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
  onSelectAll: () => void;
  onInvert: () => void;
  onSelectNew: () => void;
  onSelectUpdate: () => void;
  loading?: boolean;
  loadingMessage?: string;
  importing?: boolean;
  onConfirm: () => void;
}

export function ImportBangumiRuleSelectDialog(props: ImportBangumiRuleSelectDialogProps) {
  const allSelected = () =>
    props.comparisons.length > 0 &&
    props.selectedKeys.size === props.comparisons.length;
  const selectedCountText = () =>
    `(${props.selectedKeys.size}/${props.comparisons.length})`;

  const statusLabel = (c: BangumiRuleImportComparison) => {
    if (c.isNew) return '新';
    if (c.isUpdate) return '更新';
    return '已有';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody>
        <AppDialogHeader>
          <AppDialogTitle>导入番剧规则</AppDialogTitle>
          <AppDialogDescription>
            默认勾选新增或可更新的规则。内容相同标记为「已有」。
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
                <p class="py-8 text-center text-sm text-muted-foreground">未识别到可导入规则</p>
              }
            >
              <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectAll()}>
                  {allSelected() ? '取消全选' : '全选'}
                  {selectedCountText()}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => props.onInvert()}>
                  反选
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectNew()}>
                  仅新
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => props.onSelectUpdate()}>
                  仅更新
                </Button>
              </div>
              <ul class="space-y-2">
                <For each={props.comparisons}>
                  {(c) => {
                    const checked = () => props.selectedKeys.has(c.key);
                    const toggle = () => props.onToggle(c.key, !checked());
                    const inputId = () => `import-bangumi-rule-${c.key}-input`;
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
                        <Checkbox
                          id={inputId()}
                          checked={checked()}
                          class="pointer-events-none mt-1"
                        />
                        <Label class="sr-only" for={inputId()}>
                          选择 {c.rule.name}
                        </Label>
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <p class="truncate text-sm font-medium">{c.rule.name}</p>
                            <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {statusLabel(c)}
                            </span>
                          </div>
                          <p class="truncate text-[11px] text-muted-foreground">{c.rule.id}</p>
                          <p class="truncate text-[11px] text-muted-foreground">
                            {c.rule.baseUrl}
                            {c.existingName ? ` · 覆盖「${c.existingName}」` : ''}
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
            disabled={props.loading || props.importing || props.selectedKeys.size === 0}
            onClick={() => props.onConfirm()}
          >
            导入所选
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
