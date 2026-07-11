/**
 * 主题预设批量管理对话框
 */

import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput, AppTextFieldLabel } from '@/components/shared/AppTextField';
import {
  BUILTIN_DEFAULT_PRESET_ID,
  createThemePreset,
  deleteThemePreset,
  duplicateThemePreset,
  listThemePresets,
  renameThemePreset,
} from '@/lib/database/theme-presets';
import type { ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import { downloadThemePackJson } from '@/lib/theme/theme-pack-io';
import { applyActiveThemePackToDocument } from '@/lib/theme/theme-runtime';
import { publishActiveThemePack, publishActiveViewerThemePack } from '@/stores/theme-active-pack';
import { settingsStore } from '@/stores/settings';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import {
  CheckIcon,
  ExportIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/shared/icons';
import { saveReaderUiConfig } from '@/lib/media/text/read-config-storage';

const PRESET_KIND_LABEL: Record<ThemePresetRecord['kind'], string> = {
  builtin: '内置',
  user: '自定义',
  imported: '导入',
};

export interface ThemePresetManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPresetsChange?: () => void;
  /** 在工作室中加载某预设 */
  onLoadPreset?: (record: ThemePresetRecord) => void;
}

export function ThemePresetManageDialog(props: ThemePresetManageDialogProps) {
  const [presets, setPresets] = createSignal<ThemePresetRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [applyingId, setApplyingId] = createSignal<string | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<ThemePresetRecord | null>(null);
  const [renameValue, setRenameValue] = createSignal('');
  const [createOpen, setCreateOpen] = createSignal(false);
  const [createName, setCreateName] = createSignal('未命名主题');
  const [saving, setSaving] = createSignal(false);

  const reload = async () => {
    setLoading(true);
    try {
      setPresets(await listThemePresets());
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void reload();
      setSearchQuery('');
      setRenameTarget(null);
      setCreateOpen(false);
    }
  });

  const filteredPresets = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    const list = presets();
    if (!q) return list;
    return list.filter((record) => record.name.toLowerCase().includes(q));
  });

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

  const applyPreset = async (record: ThemePresetRecord) => {
    if (isActive(record)) return;
    setApplyingId(record.id);
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
        const cfg = await import('@/lib/media/text/read-config-storage').then((m) =>
          m.loadReaderUiConfig(),
        );
        if (cfg && manifest.viewer?.text?.surfaceAppearance) {
          await saveReaderUiConfig({
            ...cfg,
            themeSurfaceAppearance: manifest.viewer.text.surfaceAppearance,
            theme: typeof manifest.viewer.text.paletteId === 'number' ? manifest.viewer.text.paletteId : cfg.theme,
          });
        }
      }
      showAppToast({ title: `已应用「${record.name}」` });
    } finally {
      setApplyingId(null);
    }
  };

  const handleCreate = async () => {
    const name = createName().trim();
    if (!name) {
      showAppToast({ title: '预设名称不能为空', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const pack = await createThemePreset({ name });
      setCreateOpen(false);
      await reload();
      props.onPresetsChange?.();
      props.onLoadPreset?.({
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
      showAppToast({ title: '已创建预设', description: name });
    } finally {
      setSaving(false);
    }
  };

  const handleRenameSubmit = async () => {
    const target = renameTarget();
    const name = renameValue().trim();
    if (!target || !name) return;
    setSaving(true);
    try {
      const ok = await renameThemePreset(target.id, name);
      if (!ok) {
        showAppToast({ title: '重命名失败', variant: 'destructive' });
        return;
      }
      setRenameTarget(null);
      await reload();
      props.onPresetsChange?.();
      showAppToast({ title: '已重命名', description: name });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (record: ThemePresetRecord) => {
    const copy = await duplicateThemePreset(record.id);
    if (!copy) return;
    await reload();
    props.onPresetsChange?.();
    showAppToast({ title: '已创建副本', description: copy.name });
  };

  const handleDelete = async (record: ThemePresetRecord) => {
    if (record.id === BUILTIN_DEFAULT_PRESET_ID) return;
    if (!confirm(`确定删除预设「${record.name}」？此操作不可撤销。`)) return;
    await deleteThemePreset(record.id);
    await reload();
    props.onPresetsChange?.();
    showAppToast({ title: '已删除预设' });
  };

  return (
    <>
      <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
        <AppDialogContent layout="plain" class="max-w-lg">
          <AppDialogHeader
            actions={
              <Button
                size="sm"
                class="cursor-pointer"
                onClick={() => {
                  setCreateName('未命名主题');
                  setCreateOpen(true);
                }}
              >
                <PlusIcon class="mr-1 h-3.5 w-3.5" />
                新建
              </Button>
            }
          >
            <AppDialogTitle>管理主题预设</AppDialogTitle>
            <AppDialogDescription>
              批量查看、应用、重命名、复制或删除已保存的主题预设。用户预设保存在程序数据目录的 Themes 文件夹中。
            </AppDialogDescription>
          </AppDialogHeader>

          <div class="relative">
            <SearchIcon class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <AppTextField class="w-full">
              <AppTextFieldInput
                class="h-9 pl-8"
                placeholder="搜索预设名称…"
                value={searchQuery()}
                onInput={(event) => setSearchQuery(event.currentTarget.value)}
              />
            </AppTextField>
          </div>

          <Show when={loading()}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>

          <ul class="max-h-80 space-y-2 overflow-y-auto pr-1">
            <For each={filteredPresets()}>
              {(record) => {
                const active = () => isActive(record);
                const busy = () => applyingId() === record.id;
                return (
                  <li
                    class={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2',
                      active() ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-background',
                    )}
                  >
                    <span
                      class={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-medium',
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
                      <p class="truncate text-sm font-medium text-foreground">{record.name}</p>
                      <p class="truncate text-xs text-muted-foreground">
                        {PRESET_KIND_LABEL[record.kind]}
                        {record.manifest.scopes.app && record.manifest.scopes.viewer
                          ? ' · 主程序 + 阅读器'
                          : record.manifest.scopes.viewer
                            ? ' · 阅读器'
                            : ' · 主程序'}
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-0.5">
                      <Show when={!active()}>
                        <Button
                          size="sm"
                          variant="outline"
                          class="h-7 cursor-pointer px-2 text-xs"
                          disabled={busy()}
                          onClick={() => void applyPreset(record)}
                        >
                          应用
                        </Button>
                      </Show>
                      <Show when={props.onLoadPreset}>
                        <AppTooltip>
                          <AppTooltipTrigger
                            as="button"
                            type="button"
                            class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            onClick={() => props.onLoadPreset?.(record)}
                          >
                            <ExportIcon class="h-3.5 w-3.5 rotate-180" />
                          </AppTooltipTrigger>
                          <AppTooltipContent>在工作室中编辑</AppTooltipContent>
                        </AppTooltip>
                      </Show>
                      <Show when={record.kind !== 'builtin'}>
                        <AppTooltip>
                          <AppTooltipTrigger
                            as="button"
                            type="button"
                            class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            onClick={() => {
                              setRenameTarget(record);
                              setRenameValue(record.name);
                            }}
                          >
                            <PencilIcon class="h-3.5 w-3.5" />
                          </AppTooltipTrigger>
                          <AppTooltipContent>重命名</AppTooltipContent>
                        </AppTooltip>
                      </Show>
                      <AppTooltip>
                        <AppTooltipTrigger
                          as="button"
                          type="button"
                          class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          onClick={() => void handleDuplicate(record)}
                        >
                          <PlusIcon class="h-3.5 w-3.5" />
                        </AppTooltipTrigger>
                        <AppTooltipContent>复制预设</AppTooltipContent>
                      </AppTooltip>
                      <AppTooltip>
                        <AppTooltipTrigger
                          as="button"
                          type="button"
                          class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          onClick={() => downloadThemePackJson(record.manifest)}
                        >
                          <ExportIcon class="h-3.5 w-3.5" />
                        </AppTooltipTrigger>
                        <AppTooltipContent>导出 JSON</AppTooltipContent>
                      </AppTooltip>
                      <Show when={record.kind !== 'builtin'}>
                        <AppTooltip>
                          <AppTooltipTrigger
                            as="button"
                            type="button"
                            class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                            onClick={() => void handleDelete(record)}
                          >
                            <TrashIcon class="h-3.5 w-3.5" />
                          </AppTooltipTrigger>
                          <AppTooltipContent>删除</AppTooltipContent>
                        </AppTooltip>
                      </Show>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={createOpen()} onOpenChange={setCreateOpen}>
        <AppDialogContent layout="plain" class="max-w-sm">
          <AppDialogHeader>
            <AppDialogTitle>新建主题预设</AppDialogTitle>
            <AppDialogDescription>创建空白预设，可在主题工作室中继续编辑。</AppDialogDescription>
          </AppDialogHeader>
          <AppTextField>
            <AppTextFieldLabel>预设名称</AppTextFieldLabel>
            <AppTextFieldInput
              value={createName()}
              onInput={(event) => setCreateName(event.currentTarget.value)}
            />
          </AppTextField>
          <AppDialogFooter>
            <Button variant="outline" class="cursor-pointer" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button class="cursor-pointer" disabled={saving()} onClick={() => void handleCreate()}>
              创建
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
            <AppDialogTitle>重命名预设</AppDialogTitle>
          </AppDialogHeader>
          <AppTextField>
            <AppTextFieldLabel>新名称</AppTextFieldLabel>
            <AppTextFieldInput
              value={renameValue()}
              onInput={(event) => setRenameValue(event.currentTarget.value)}
            />
          </AppTextField>
          <AppDialogFooter>
            <Button variant="outline" class="cursor-pointer" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button class="cursor-pointer" disabled={saving()} onClick={() => void handleRenameSubmit()}>
              保存
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}
