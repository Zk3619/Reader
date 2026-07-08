/**
 * 设置页 — 主题预设列表与快速切换
 */

import { createSignal, For, onMount, Show } from 'solid-js';
import { listThemePresets } from '@/lib/database/theme-presets';
import type { ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import { applyActiveThemePackToDocument } from '@/lib/theme/theme-runtime';
import { publishActiveThemePack, publishActiveViewerThemePack } from '@/stores/theme-active-pack';
import { settingsStore } from '@/stores/settings';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import { CheckIcon } from '@/components/shared/icons';

const PRESET_KIND_LABEL: Record<ThemePresetRecord['kind'], string> = {
  builtin: '内置',
  user: '自定义',
  imported: '导入',
};

export function ThemePresetListSetting() {
  const [presets, setPresets] = createSignal<ThemePresetRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [applyingId, setApplyingId] = createSignal<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setPresets(await listThemePresets());
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void reload());

  const activeAppId = () => settingsStore.state.app.activeThemePresetId;
  const activeViewerId = () => settingsStore.state.app.activeViewerThemePresetId;

  const isActive = (record: ThemePresetRecord) => {
    const manifest = record.manifest;
    const appActive = manifest.scopes.app !== false && activeAppId() === record.id;
    const viewerActive = manifest.scopes.viewer !== false && activeViewerId() === record.id;
    if (manifest.scopes.app && manifest.scopes.viewer) {
      return appActive && viewerActive;
    }
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
      }
      showAppToast({ title: `已应用「${record.name}」` });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4 space-y-1">
        <h3 class="font-semibold text-foreground">主题预设</h3>
        <p class="text-sm text-muted-foreground">
          快速切换已保存的主题包（含组件背景、语义色与特效）
        </p>
      </div>

      <Show when={loading()}>
        <p class="text-sm text-muted-foreground">加载预设中…</p>
      </Show>

      <Show when={!loading() && presets().length === 0}>
        <p class="text-sm text-muted-foreground">暂无主题预设，可在主题工作室创建并保存。</p>
      </Show>

      <ul class="flex flex-col gap-2">
        <For each={presets()}>
          {(record) => {
            const active = () => isActive(record);
            const busy = () => applyingId() === record.id;
            return (
              <li>
                <button
                  type="button"
                  disabled={busy()}
                  class={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    active()
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/50 bg-background hover:bg-accent/40',
                    busy() && 'opacity-70',
                  )}
                  onClick={() => void applyPreset(record)}
                >
                  <span
                    class={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      active() ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    <Show when={active()} fallback={<span class="text-xs font-medium">{record.name.slice(0, 1)}</span>}>
                      <CheckIcon class="h-4 w-4" />
                    </Show>
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-foreground">{record.name}</span>
                    <span class="block truncate text-xs text-muted-foreground">
                      {PRESET_KIND_LABEL[record.kind]}
                      {record.manifest.scopes.app && record.manifest.scopes.viewer
                        ? ' · 主程序 + 阅读器'
                        : record.manifest.scopes.viewer
                          ? ' · 阅读器'
                          : ' · 主程序'}
                    </span>
                  </span>
                  <Show when={!active()}>
                    <span class="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      应用
                    </span>
                  </Show>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
}
