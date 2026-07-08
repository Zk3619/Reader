/**
 * Theme Studio — 全屏主题编辑与实时预览
 */

import { createSignal, For, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { PageHeader } from '@/components/shell/PageHeader';
import { cn } from '@/lib/utils';
import { ThemePreviewSandbox } from '@/components/theme/ThemePreviewSandbox';
import { ThemeStudioInspector } from '@/components/theme/ThemeStudioInspector';
import {
  listRootThemeComponents,
  listChildThemeComponents,
  type ThemeComponentDescriptor,
} from '@/lib/theme/preview/component-registry';
import type { ThemeApplyScope, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { themeStudioStore } from '@/stores/theme-studio';
import {
  deleteThemePreset,
  duplicateThemePreset,
  listThemePresets,
  upsertThemePreset,
} from '@/lib/database/theme-presets';
import type { ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import {
  downloadThemePackJson,
  downloadThemePackZip,
  importLegadoThemeConfigJson,
  importThemePackJson,
  importThemePackZip,
} from '@/lib/theme/theme-pack-io';
import { applyActiveThemePackToDocument } from '@/lib/theme/theme-runtime';
import { publishActiveThemePack, publishActiveViewerThemePack } from '@/stores/theme-active-pack';
import { settingsStore } from '@/stores/settings';
import { saveReaderUiConfig } from '@/lib/media/text/read-config-storage';
import { showAppToast } from '@/components/shared/AppToasts';
import { summarizeThemePackDiff } from '@/lib/theme/adapters/legado-theme-adapter';

export interface ThemeStudioPageProps {
  onBack?: () => void;
}

function ComponentTreeNode(props: {
  node: ThemeComponentDescriptor;
  selected: ThemeComponentId;
  depth?: number;
  onSelect: (id: ThemeComponentId) => void;
}) {
  const depth = () => props.depth ?? 0;
  const children = () => listChildThemeComponents(props.node.id);

  return (
    <>
      <button
        type="button"
        class={cn(
          'w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm transition-colors',
          props.selected === props.node.id
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-accent/50',
        )}
        style={{ 'padding-left': `${8 + depth() * 12}px` }}
        onClick={() => props.onSelect(props.node.id)}
      >
        {props.node.label}
      </button>
      <For each={children()}>
        {(child) => (
          <ComponentTreeNode
            node={child}
            selected={props.selected}
            depth={depth() + 1}
            onSelect={props.onSelect}
          />
        )}
      </For>
    </>
  );
}

export function ThemeStudioPage(props: ThemeStudioPageProps) {
  const [presets, setPresets] = createSignal<ThemePresetRecord[]>([]);
  const [loadingPresets, setLoadingPresets] = createSignal(true);
  const [discardDialogOpen, setDiscardDialogOpen] = createSignal(false);

  const reloadPresets = async () => {
    setLoadingPresets(true);
    try {
      setPresets(await listThemePresets());
    } finally {
      setLoadingPresets(false);
    }
  };

  onMount(() => void reloadPresets());

  const domain = () => (themeStudioStore.state.scope === 'viewer' ? 'viewer' : 'app');

  const handleSave = async () => {
    const pack = themeStudioStore.state.draftPack;
    await upsertThemePreset(pack, 'user');
    themeStudioStore.markSaved();
    await reloadPresets();
    showAppToast({ title: '主题已保存' });
  };

  const handleApply = async () => {
    const pack = themeStudioStore.state.draftPack;
    await upsertThemePreset(pack, 'user');
    themeStudioStore.markSaved();

    if (pack.scopes.app) {
      settingsStore.setActiveThemePresetId(pack.id);
      applyActiveThemePackToDocument(pack);
      publishActiveThemePack(pack);
    }
    if (pack.scopes.viewer) {
      await settingsStore.setActiveViewerThemePresetId(pack.id);
      publishActiveViewerThemePack(pack);
      const cfg = await import('@/lib/media/text/read-config-storage').then((m) =>
        m.loadReaderUiConfig(),
      );
      if (cfg && pack.viewer?.text?.surfaceAppearance) {
        await saveReaderUiConfig({
          ...cfg,
          themeSurfaceAppearance: pack.viewer.text.surfaceAppearance,
          theme: typeof pack.viewer.text.paletteId === 'number' ? pack.viewer.text.paletteId : cfg.theme,
        });
      }
    }

    showAppToast({ title: '主题已应用' });
    await reloadPresets();
  };

  const handleExportJson = () => {
    downloadThemePackJson(themeStudioStore.state.draftPack);
  };

  const handleExportZip = async () => {
    await downloadThemePackZip(themeStudioStore.state.draftPack);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip,.reader-theme.json,.reader-theme.zip,application/json,application/zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      if (name.endsWith('.zip')) {
        const result = await importThemePackZip(file);
        if (!result.ok || !result.pack) {
          showAppToast({ title: '导入失败', description: result.issues[0]?.message, variant: 'destructive' });
          return;
        }
        const diff = summarizeThemePackDiff(themeStudioStore.state.draftPack, result.pack);
        themeStudioStore.setDraftPack(result.pack);
        await upsertThemePreset(result.pack, 'imported');
        themeStudioStore.markSaved();
        await reloadPresets();
        showAppToast({ title: '已导入 ZIP', description: diff.join(' · ') || undefined });
        return;
      }
      const text = await file.text();
      const legado = importLegadoThemeConfigJson(text);
      if (legado.length > 0) {
        themeStudioStore.setDraftPack(legado[0]!);
        showAppToast({ title: `已导入 Legado 主题（${legado.length} 条，已加载首条）` });
        return;
      }
      const result = importThemePackJson(text);
      if (!result.ok || !result.pack) {
        showAppToast({ title: '导入失败', description: result.issues[0]?.message, variant: 'destructive' });
        return;
      }
      themeStudioStore.setDraftPack(result.pack);
      showAppToast({ title: '已导入 JSON' });
    };
    input.click();
  };

  const handleLoadPreset = (record: ThemePresetRecord) => {
    themeStudioStore.openStudio({
      entry: themeStudioStore.state.entry,
      scope: themeStudioStore.state.scope,
      pack: record.manifest,
      presetId: record.id,
    });
  };

  const handleDuplicate = async (id: string) => {
    const copy = await duplicateThemePreset(id);
    if (copy) {
      themeStudioStore.setDraftPack(copy);
      await reloadPresets();
      showAppToast({ title: '已创建副本' });
    }
  };

  const handleDelete = async (id: string) => {
    await deleteThemePreset(id);
    await reloadPresets();
    showAppToast({ title: '已删除预设' });
  };

  const setScope = (scope: ThemeApplyScope) => themeStudioStore.setScope(scope);

  const leaveStudio = () => {
    setDiscardDialogOpen(false);
    themeStudioStore.closeStudio();
    props.onBack?.();
  };

  const handleBack = () => {
    if (themeStudioStore.state.dirty) {
      setDiscardDialogOpen(true);
      return;
    }
    leaveStudio();
  };

  const handleSaveAndLeave = async () => {
    await handleSave();
    leaveStudio();
  };

  return (
    <section
      class="pointer-events-auto fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
      aria-label="主题工作室"
    >
      <PageHeader
        onBack={handleBack}
        title={themeStudioStore.state.draftPack.name}
        subtitle={
          themeStudioStore.state.dirty ? '未保存的更改' : '实时预览 · 组件级调整'
        }
        pinToTop
        draggable
        showThemeToggle={false}
        trailing={
          <div class="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" class="cursor-pointer" onClick={() => themeStudioStore.resetDraft()}>
              撤销
            </Button>
            <Button variant="outline" size="sm" class="cursor-pointer" onClick={handleImportFile}>
              导入
            </Button>
            <Button variant="outline" size="sm" class="cursor-pointer" onClick={handleExportJson}>
              导出 JSON
            </Button>
            <Button variant="outline" size="sm" class="cursor-pointer" onClick={() => void handleExportZip()}>
              导出 ZIP
            </Button>
            <Button variant="secondary" size="sm" class="cursor-pointer" onClick={() => void handleSave()}>
              保存
            </Button>
            <Button size="sm" class="cursor-pointer" onClick={() => void handleApply()}>
              应用
            </Button>
          </div>
        }
      />

      <div class="flex min-h-0 flex-1 overflow-hidden">
        <aside class="flex min-h-0 w-52 shrink-0 flex-col overflow-hidden border-r border-border bg-card/30">
          <div class="border-b border-border p-3">
            <p class="mb-2 text-xs font-medium text-muted-foreground">作用域</p>
            <div class="flex flex-col gap-1">
              <Button
                size="sm"
                variant={themeStudioStore.state.scope === 'all' ? 'default' : 'ghost'}
                class="cursor-pointer justify-start"
                onClick={() => setScope('all')}
              >
                全部
              </Button>
              <Button
                size="sm"
                variant={themeStudioStore.state.scope === 'app' ? 'default' : 'ghost'}
                class="cursor-pointer justify-start"
                onClick={() => setScope('app')}
              >
                主程序
              </Button>
              <Button
                size="sm"
                variant={themeStudioStore.state.scope === 'viewer' ? 'default' : 'ghost'}
                class="cursor-pointer justify-start"
                onClick={() => setScope('viewer')}
              >
                阅读器
              </Button>
            </div>
          </div>

          <div class="border-b border-border p-3">
            <p class="mb-2 text-xs font-medium text-muted-foreground">预览</p>
            <div class="flex gap-1">
              <Button
                size="sm"
                variant={themeStudioStore.state.previewMode === 'full' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setPreviewMode('full')}
              >
                整体
              </Button>
              <Button
                size="sm"
                variant={themeStudioStore.state.previewMode === 'component' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setPreviewMode('component')}
              >
                组件
              </Button>
            </div>
            <div class="mt-2 flex gap-1">
              <Button
                size="sm"
                variant={themeStudioStore.state.colorMode === 'light' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setColorMode('light')}
              >
                浅色
              </Button>
              <Button
                size="sm"
                variant={themeStudioStore.state.colorMode === 'dark' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setColorMode('dark')}
              >
                深色
              </Button>
            </div>
            <div class="mt-2 flex gap-1">
              <Button
                size="sm"
                variant={themeStudioStore.state.viewport === 'mobile' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setViewport('mobile')}
              >
                手机
              </Button>
              <Button
                size="sm"
                variant={themeStudioStore.state.viewport === 'tablet' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setViewport('tablet')}
              >
                平板
              </Button>
              <Button
                size="sm"
                variant={themeStudioStore.state.viewport === 'desktop' ? 'default' : 'outline'}
                class="cursor-pointer flex-1"
                onClick={() => themeStudioStore.setViewport('desktop')}
              >
                桌面
              </Button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <p class="mb-1 px-2 text-xs font-medium text-muted-foreground">组件树</p>
            <For each={listRootThemeComponents(domain())}>
              {(node) => (
                <ComponentTreeNode
                  node={node}
                  selected={themeStudioStore.state.selectedComponentId}
                  onSelect={(id) => themeStudioStore.setSelectedComponent(id)}
                />
              )}
            </For>
          </div>

          <div class="max-h-40 overflow-y-auto border-t border-border p-2">
            <p class="mb-1 px-1 text-xs font-medium text-muted-foreground">预设</p>
            <Show when={loadingPresets()}>
              <p class="px-1 text-xs text-muted-foreground">加载中…</p>
            </Show>
            <For each={presets()}>
              {(p) => (
                <div class="mb-1 flex items-center gap-1">
                  <button
                    type="button"
                    class="min-w-0 flex-1 cursor-pointer truncate rounded px-2 py-1 text-left text-xs hover:bg-accent/50"
                    onClick={() => handleLoadPreset(p)}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer rounded px-1 text-xs text-muted-foreground hover:text-foreground"
                    title="复制"
                    onClick={() => void handleDuplicate(p.id)}
                  >
                    +
                  </button>
                  <Show when={p.kind !== 'builtin'}>
                    <button
                      type="button"
                      class="cursor-pointer rounded px-1 text-xs text-destructive hover:underline"
                      onClick={() => void handleDelete(p.id)}
                    >
                      ×
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </aside>

        <main class="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <ThemePreviewSandbox
            pack={() => themeStudioStore.state.draftPack}
            scope={() => themeStudioStore.state.scope}
            previewMode={() => themeStudioStore.state.previewMode}
            selectedComponentId={() => themeStudioStore.state.selectedComponentId}
            colorMode={() => themeStudioStore.state.colorMode}
            viewport={() => themeStudioStore.state.viewport}
            packRevision={() => themeStudioStore.state.draftRevision}
            class="min-h-0 flex-1"
          />
        </main>

        <aside class="flex min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-card/30">
          <ThemeStudioInspector selectedComponentId={themeStudioStore.state.selectedComponentId} />
        </aside>
      </div>

      <AppDialog open={discardDialogOpen()} onOpenChange={setDiscardDialogOpen}>
        <AppDialogContent layout="plain" class="max-w-md">
          <AppDialogHeader>
            <AppDialogTitle>放弃未保存的更改？</AppDialogTitle>
            <AppDialogDescription>
              当前主题有尚未保存的修改。离开后将丢失这些更改。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogFooter class="gap-2 sm:gap-0">
            <Button variant="outline" class="cursor-pointer" onClick={() => setDiscardDialogOpen(false)}>
              继续编辑
            </Button>
            <Button variant="destructive" class="cursor-pointer" onClick={leaveStudio}>
              放弃更改
            </Button>
            <Button class="cursor-pointer" onClick={() => void handleSaveAndLeave()}>
              保存并离开
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </section>
  );
}
