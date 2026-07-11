/**
 * 主题管理：多选列表 + 批量操作
 */

import {
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  For,
  Show,
} from 'solid-js';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  ThemesManagePageToolbar,
  ThemesManageToolbarLeading,
  type ThemeManageSortMode,
} from '@/components/theme/ThemesManagePageToolbar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { notifyPageError } from '@/lib/ui/page-notify';
import {
  BUILTIN_DEFAULT_PRESET_ID,
  createThemePreset,
  deleteThemePreset,
  duplicateThemePreset,
  listThemePresets,
  renameThemePreset,
} from '@/lib/database/theme-presets';
import type { ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import { onThemePresetsChanged } from '@/lib/theme/theme-preset-events';
import { applyActiveThemePackToDocument } from '@/lib/theme/theme-runtime';
import { publishActiveThemePack, publishActiveViewerThemePack } from '@/stores/theme-active-pack';
import { settingsStore } from '@/stores/settings';
import { saveReaderUiConfig, loadReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { AppTextField, AppTextFieldInput, AppTextFieldLabel } from '@/components/shared/AppTextField';
import { CheckIcon } from '@/components/shared/icons';

const PRESET_KIND_LABEL: Record<ThemePresetRecord['kind'], string> = {
  builtin: '内置',
  user: '自定义',
  imported: '导入',
};

export interface ThemesManagePageProps {
  onClose?: () => void;
  onThemesImportLocal?: () => void;
  onThemesImportNetwork?: () => void;
  onThemesImportCode?: () => void;
  onOpenThemeStudio?: (record?: ThemePresetRecord) => void;
}

export function ThemesManagePage(props: ThemesManagePageProps) {
  const [presets, setPresets] = createSignal<ThemePresetRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortMode, setSortMode] = createSignal<ThemeManageSortMode>('updated');
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = createSignal<ThemePresetRecord | null>(null);
  const [renameValue, setRenameValue] = createSignal('');
  const [batchDeleteCount, setBatchDeleteCount] = createSignal(0);
  const [actionBusy, setActionBusy] = createSignal(false);

  const showSkeleton = useSkeletonLoading(loading, { delay: 100, minDisplayTime: 300 });

  async function loadPresets() {
    setLoading(true);
    try {
      setPresets(await listThemePresets());
    } catch (e) {
      notifyPageError('加载主题失败', e instanceof Error ? e.message : undefined);
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    void loadPresets();
    const unsubscribe = onThemePresetsChanged(() => void loadPresets());
    onCleanup(unsubscribe);
  });

  const filteredPresets = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    let list = presets();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    const mode = sortMode();
    return [...list].sort((a, b) => {
      if (a.kind === 'builtin') return -1;
      if (b.kind === 'builtin') return 1;
      if (mode === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (mode === 'kind') return a.kind.localeCompare(b.kind);
      return b.updatedAt - a.updatedAt;
    });
  });

  const pageDescription = () => `共 ${filteredPresets().length} 个主题预设`;

  const activeAppId = () => settingsStore.state.app.activeThemePresetId;
  const activeViewerId = () => settingsStore.state.app.activeViewerThemePresetId;

  const isActive = (record: ThemePresetRecord) => {
    const manifest = record.manifest;
    const appActive = manifest.scopes.app !== false && activeAppId() === record.id;
    const viewerActive = manifest.scopes.viewer !== false && activeViewerId() === record.id;
    if (manifest.scopes.app && manifest.scopes.viewer) return appActive && viewerActive;
    if (manifest.scopes.app) return appActive;
    if (manifest.scopes.viewer) return viewerActive;
    return appActive || viewerActive;
  };

  const allFilteredSelected = createMemo(() => {
    const list = filteredPresets().filter((p) => p.kind !== 'builtin');
    if (list.length === 0) return false;
    return list.every((p) => selectedIds().has(p.id));
  });

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected()) {
      setSelectedIds(new Set<string>());
      return;
    }
    setSelectedIds(new Set(filteredPresets().filter((p) => p.kind !== 'builtin').map((p) => p.id)));
  };

  const invertSelection = () => {
    const selectable = new Set(filteredPresets().filter((p) => p.kind !== 'builtin').map((p) => p.id));
    const next = new Set<string>();
    selectable.forEach((id) => {
      if (!selectedIds().has(id)) next.add(id);
    });
    setSelectedIds(next);
  };

  const applyPreset = async (record: ThemePresetRecord) => {
    if (isActive(record)) return;
    setActionBusy(true);
    try {
      const manifest = record.manifest;
      if (manifest.scopes.app !== false && manifest.app) {
        settingsStore.setActiveThemePresetId(record.id);
        applyActiveThemePackToDocument(manifest);
        publishActiveThemePack(manifest);
      }
      if (manifest.scopes.viewer !== false && manifest.viewer) {
        await settingsStore.setActiveViewerThemePresetId(record.id);
        publishActiveViewerThemePack(manifest);
        const cfg = await loadReaderUiConfig();
        if (cfg && manifest.viewer?.text?.surfaceAppearance) {
          await saveReaderUiConfig({
            ...cfg,
            themeSurfaceAppearance: manifest.viewer.text.surfaceAppearance,
            theme:
              typeof manifest.viewer.text.paletteId === 'number'
                ? manifest.viewer.text.paletteId
                : cfg.theme,
          });
        }
      }
      showAppToast({ title: `已应用「${record.name}」` });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreate = async () => {
    setActionBusy(true);
    try {
      const pack = await createThemePreset({ name: '未命名主题' });
      await loadPresets();
      showAppToast({ title: '已创建主题', description: pack.name });
      props.onOpenThemeStudio?.({
        id: pack.id,
        name: pack.name,
        kind: 'user',
        scopesApp: pack.scopes.app !== false,
        scopesViewer: pack.scopes.viewer !== false,
        manifest: pack,
        thumbnailPath: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRename = async () => {
    const target = renameTarget();
    const name = renameValue().trim();
    if (!target || !name) return;
    setActionBusy(true);
    try {
      const ok = await renameThemePreset(target.id, name);
      if (!ok) {
        showAppToast({ title: '重命名失败', variant: 'destructive' });
        return;
      }
      setRenameTarget(null);
      await loadPresets();
      showAppToast({ title: '已重命名' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleBatchDelete = async () => {
    const ids = [...selectedIds()].filter((id) => id !== BUILTIN_DEFAULT_PRESET_ID);
    setBatchDeleteCount(0);
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        await deleteThemePreset(id);
      }
      setSelectedIds(new Set<string>());
      await loadPresets();
      showAppToast({ title: '已删除', description: `已删除 ${ids.length} 个主题` });
    } catch (e) {
      showAppToast({
        title: '批量删除失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  const batchExport = () => {
    const list = presets().filter((p) => selectedIds().has(p.id));
    if (list.length === 0) return;
    const payload = list.map((p) => p.manifest);
    const json = JSON.stringify(payload.length === 1 ? payload[0] : payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `主题_${list.length}个_${Date.now()}.reader-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
    showAppToast({ title: '已导出', description: `已导出 ${list.length} 个主题` });
    setSelectedIds(new Set<string>());
  };

  const batchDuplicate = async () => {
    const ids = [...selectedIds()];
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      for (const id of ids) {
        await duplicateThemePreset(id);
      }
      await loadPresets();
      showAppToast({ title: '已复制', description: `已复制 ${ids.length} 个主题` });
      setSelectedIds(new Set<string>());
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div class={cn('@container', mainShellPageRoot)}>
      <PageToolbar
        title="主题管理"
        description={pageDescription()}
        titleSlot={
          <PageToolbarTitleDropdown
            title="主题管理"
            description={pageDescription()}
            dropdownEnabled={false}
          />
        }
        leading={<ThemesManageToolbarLeading onBack={() => props.onClose?.()} />}
      >
        <ThemesManagePageToolbar
          searchQuery={searchQuery()}
          onSearchQueryChange={setSearchQuery}
          sortMode={sortMode()}
          onSortModeChange={setSortMode}
          onThemesNew={() => void handleCreate()}
          onThemesImportLocal={props.onThemesImportLocal}
          onThemesImportNetwork={props.onThemesImportNetwork}
          onThemesImportCode={props.onThemesImportCode}
          onOpenThemeStudio={() => props.onOpenThemeStudio?.()}
        />
      </PageToolbar>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
        <Show when={showSkeleton()}>
          <ul class="shrink-0 space-y-2 px-1">
            <For each={[1, 2, 3, 4, 5]}>
              {() => (
                <li class="flex h-14 items-center gap-3 rounded-lg border border-border/50 bg-card px-3 animate-pulse">
                  <span class="h-4 w-4 rounded bg-muted" />
                  <span class="h-4 flex-1 rounded bg-muted" />
                  <span class="h-5 w-12 rounded bg-muted" />
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={!loading() && !showSkeleton() && presets().length === 0}>
          <div class="flex flex-1 items-center justify-center px-1">
            <div class="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              <p>暂无主题预设</p>
              <p class="mt-1">可通过「更多」新建或导入主题</p>
            </div>
          </div>
        </Show>

        <Show when={!loading() && !showSkeleton() && filteredPresets().length > 0}>
          <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2">
            <For each={filteredPresets()}>
              {(record) => {
                const active = () => isActive(record);
                const selectable = record.kind !== 'builtin';
                return (
                  <li class="box-border pb-1">
                    <div
                      class={cn(
                        'overflow-hidden rounded-lg border border-border/50 bg-card',
                        active() && 'border-primary/30 bg-primary/5',
                      )}
                    >
                      <div
                        class={cn(
                          'flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-all',
                          'hover:bg-accent/30',
                        )}
                        onClick={() => {
                          if (selectable) toggleSelection(record.id);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <Show when={selectable}>
                          <div class="shrink-0" onClick={(e) => e.stopPropagation()} role="presentation">
                            <Checkbox
                              checked={selectedIds().has(record.id)}
                              onChange={(checked: boolean) => {
                                const next = new Set(selectedIds());
                                if (checked) next.add(record.id);
                                else next.delete(record.id);
                                setSelectedIds(next);
                              }}
                              aria-label={`选择 ${record.name}`}
                            />
                          </div>
                        </Show>
                        <span
                          class={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-medium',
                            active()
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border bg-muted text-muted-foreground',
                          )}
                        >
                          <Show when={active()} fallback={record.name.slice(0, 1)}>
                            <CheckIcon class="h-4 w-4" />
                          </Show>
                        </span>
                        <div class="min-w-0 flex-1">
                          <TruncatedTooltip
                            as="span"
                            text={record.name}
                            class="block truncate font-medium text-foreground"
                          />
                          <p class="truncate text-xs text-muted-foreground">
                            {PRESET_KIND_LABEL[record.kind]}
                            {record.manifest.scopes.app && record.manifest.scopes.viewer
                              ? ' · 主程序 + 阅读器'
                              : record.manifest.scopes.viewer
                                ? ' · 阅读器'
                                : ' · 主程序'}
                          </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()} role="presentation">
                          <Show when={active()}>
                            <Badge variant="secondary" class="text-[10px]">
                              使用中
                            </Badge>
                          </Show>
                          <Show when={!active()}>
                            <Button
                              size="sm"
                              variant="outline"
                              class="h-7 px-2 text-xs"
                              disabled={actionBusy()}
                              onClick={() => void applyPreset(record)}
                            >
                              应用
                            </Button>
                          </Show>
                          <Button
                            size="sm"
                            variant="ghost"
                            class="h-7 px-2 text-xs"
                            onClick={() => props.onOpenThemeStudio?.(record)}
                          >
                            编辑
                          </Button>
                          <Show when={selectable}>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="h-7 px-2 text-xs"
                              onClick={() => {
                                setRenameTarget(record);
                                setRenameValue(record.name);
                              }}
                            >
                              重命名
                            </Button>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </div>

      <div class="shrink-0 border-t border-border px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleSelectAll} disabled={filteredPresets().length === 0}>
              {allFilteredSelected() ? '取消全选' : '全选'}
            </Button>
            <Button variant="outline" size="sm" onClick={invertSelection} disabled={filteredPresets().length === 0}>
              反选
            </Button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void batchDuplicate()} disabled={selectedIds().size === 0}>
              复制所选
            </Button>
            <Button variant="outline" size="sm" onClick={batchExport} disabled={selectedIds().size === 0}>
              导出所选
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBatchDeleteCount(selectedIds().size)} disabled={selectedIds().size === 0}>
              删除所选
            </Button>
          </div>
        </div>
      </div>

      <AppDialog open={batchDeleteCount() > 0} onOpenChange={(open) => !open && setBatchDeleteCount(0)}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>删除所选主题</AppDialogTitle>
            <AppDialogDescription>
              确定删除所选 {batchDeleteCount()} 个主题？删除后无法恢复（内置默认主题不可删除）。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteCount(0)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleBatchDelete()}>
              删除
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog
        open={renameTarget() != null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <AppDialogContent layout="plain" class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>重命名主题</AppDialogTitle>
          </AppDialogHeader>
          <AppTextField>
            <AppTextFieldLabel>新名称</AppTextFieldLabel>
            <AppTextFieldInput
              value={renameValue()}
              onInput={(e) => setRenameValue(e.currentTarget.value)}
            />
          </AppTextField>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button disabled={actionBusy()} onClick={() => void handleRename()}>
              保存
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
