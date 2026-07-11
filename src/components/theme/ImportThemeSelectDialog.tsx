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
import type { ImportThemeComparison } from '@/lib/theme/import/import-theme-merge';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

export interface ImportThemeSelectDialogProps {
  open: boolean;
  loading: boolean;
  loadingMessage?: string;
  packs: ReaderThemePackV1[];
  comparisons: ImportThemeComparison[];
  selectedIds: Set<string>;
  keepName: boolean;
  keepActive: boolean;
  overwriteAssets: boolean;
  portalZClass?: string;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string, checked: boolean) => void;
  onSelectAllToggle: () => void;
  onInvertSelect: () => void;
  onSelectNewToggle: () => void;
  onSelectUpdateToggle: () => void;
  onKeepNameChange: (v: boolean) => void;
  onKeepActiveChange: (v: boolean) => void;
  onOverwriteAssetsChange: (v: boolean) => void;
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

export function ImportThemeSelectDialog(props: ImportThemeSelectDialogProps) {
  const allSelected = () =>
    props.packs.length > 0 && props.selectedIds.size === props.packs.length;
  const selectedCountText = () => `(${props.selectedIds.size}/${props.packs.length})`;

  const comparisonById = () => {
    const map = new Map<string, ImportThemeComparison>();
    for (const c of props.comparisons) {
      map.set(c.incoming.id, c);
    }
    return map;
  };

  const statusLabel = (id: string) => {
    const c = comparisonById().get(id);
    if (!c) return null;
    if (c.status === 'new') return '新';
    return '更新';
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent portalToBody portalZClass={props.portalZClass}>
        <AppDialogHeader>
          <AppDialogTitle>导入主题</AppDialogTitle>
          <AppDialogDescription>
            默认勾选新增或远程更新时间更晚的主题。可保留本地名称与当前激活预设。
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
                  checked={props.keepActive}
                  label="保留激活预设"
                  onChange={props.onKeepActiveChange}
                />
                <OptionCheckRow
                  checked={props.overwriteAssets}
                  label="覆盖 ZIP 资产"
                  onChange={props.onOverwriteAssetsChange}
                />
              </div>
            </section>
          </Show>
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
              when={props.packs.length > 0}
              fallback={<p class="text-sm text-muted-foreground">未识别到有效主题包</p>}
            >
              <div class="space-y-3">
                <For each={props.packs}>
                  {(pack) => {
                    const checked = () => props.selectedIds.has(pack.id);
                    const tag = statusLabel(pack.id);
                    const toggle = () => props.onToggle(pack.id, !checked());
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
                            <span class="block truncate text-sm font-medium">{pack.name}</span>
                            <Show when={tag}>
                              <span
                                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                classList={{
                                  'bg-primary/15 text-primary': tag === '新',
                                  'bg-amber-500/15 text-amber-700 dark:text-amber-400': tag === '更新',
                                }}
                              >
                                {tag}
                              </span>
                            </Show>
                          </div>
                          <span class="block truncate text-xs text-muted-foreground">
                            {pack.id}
                            {pack.scopes.app && pack.scopes.viewer
                              ? ' · 主程序 + 阅读器'
                              : pack.scopes.viewer
                                ? ' · 阅读器'
                                : ' · 主程序'}
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
          <Button variant="outline" onClick={props.onSelectAllToggle} disabled={props.loading || props.packs.length === 0}>
            {allSelected() ? '取消选中' : '全选'} {selectedCountText()}
          </Button>
          <Button variant="outline" onClick={props.onInvertSelect} disabled={props.loading || props.packs.length === 0}>
            反选
          </Button>
          <Button variant="outline" onClick={props.onSelectNewToggle} disabled={props.loading || props.packs.length === 0}>
            勾选新增
          </Button>
          <Button variant="outline" onClick={props.onSelectUpdateToggle} disabled={props.loading || props.packs.length === 0}>
            勾选更新
          </Button>
          <div class="flex-1" />
          <div class="flex items-center gap-2">
            <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={props.loading}>
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
