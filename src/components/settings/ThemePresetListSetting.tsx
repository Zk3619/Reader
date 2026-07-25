/**
 * 设置页 — 主题预设列表与快速切换
 */

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ensureDefaultThemePresetActive,
  listThemePresets,
} from '@/lib/database/theme-presets';
import type { ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import { onThemePresetsChanged } from '@/lib/theme/theme-preset-events';
import { applyActiveThemePackToDocument } from '@/lib/theme/theme-runtime';
import {
  publishActiveThemePack,
  publishActiveThemeTargetPack,
  publishActiveViewerThemePack,
} from '@/stores/theme-active-pack';
import { settingsStore } from '@/stores/settings';
import { showAppToast } from '@/components/shared/AppToasts';
import { cn } from '@/lib/utils';
import { CheckIcon, FolderTreeIcon } from '@/components/shared/icons';
import { ThemePresetManageDialog } from '@/components/theme/ThemePresetManageDialog';
import {
  isThemePackApplicableToTarget,
  isThemePresetActiveForTarget,
  normalizeActiveThemePresetByTarget,
  THEME_TARGET_IDS,
  type ThemeTargetId,
} from '@/lib/theme/theme-targets';
import { getEffectiveDark, onDocumentColorModeChange } from '@/lib/theme/runtime';
import { BUILTIN_DEFAULT_PRESET_ID } from '@/lib/theme/theme-preset-file-storage';

const PRESET_KIND_LABEL: Record<ThemePresetRecord['kind'], string> = {
  builtin: '内置',
  user: '自定义',
  imported: '导入',
};

const QUICK_THEME_TARGETS: readonly {
  id: 'app' | 'module.reading';
  label: string;
  description: string;
}[] = [
  { id: 'app', label: '主程序', description: '应用壳层、导航和通用控件' },
  { id: 'module.reading', label: '阅读模块', description: '阅读器共享外壳和阅读内容' },
  // module.music / module.tv 快速切换已弃用：模块主题改由主题工作室统一接管
];

export function ThemePresetListSetting() {
  const [presets, setPresets] = createSignal<ThemePresetRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [applyingId, setApplyingId] = createSignal<string | null>(null);
  const [manageOpen, setManageOpen] = createSignal(false);
  const [dark, setDark] = createSignal(getEffectiveDark());

  const reload = async () => {
    setLoading(true);
    try {
      setPresets(await listThemePresets());
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void (async () => {
      await ensureDefaultThemePresetActive();
      await reload();
    })();
    const unsubscribe = onThemePresetsChanged(() => void reload());
    const unsubscribeMode = onDocumentColorModeChange(setDark);
    onCleanup(() => {
      unsubscribe();
      unsubscribeMode();
    });
  });

  const activeByTarget = () =>
    normalizeActiveThemePresetByTarget(
      Object.fromEntries(
        THEME_TARGET_IDS.map((target) => [
          target,
          settingsStore.state.app.activeThemePresetByTarget?.[target],
        ]),
      ),
      settingsStore.state.app,
    );
  const presetsForTarget = (target: ThemeTargetId) =>
    presets().filter(
      (record) =>
        isThemePackApplicableToTarget(record.manifest, target) &&
        !(target === 'module.reading' && record.id === BUILTIN_DEFAULT_PRESET_ID),
    );
  const targetUsesParentTheme = (target: ThemeTargetId) => {
    const activeId = activeByTarget()[target];
    return !activeId || (target === 'module.reading' && activeId === BUILTIN_DEFAULT_PRESET_ID);
  };
  const isActive = (record: ThemePresetRecord, target: ThemeTargetId) =>
    isThemePresetActiveForTarget(record.id, target, activeByTarget());
  const previewForTarget = (record: ThemePresetRecord, target: ThemeTargetId) => {
    const targetTokens = record.manifest.targets?.[target]?.tokens;
    const appTokens = record.manifest.app?.tokens;
    const tokens = targetTokens ?? appTokens;
    const palette = dark() ? tokens?.dark : tokens?.light;
    return palette
      ? {
          background: `hsl(${palette.background})`,
          foreground: `hsl(${palette.foreground})`,
          primary: `hsl(${palette.primary})`,
        }
      : undefined;
  };

  const applyPreset = async (record: ThemePresetRecord, target: ThemeTargetId, label: string) => {
    if (isActive(record, target)) return;
    setApplyingId(`${target}:${record.id}`);
    try {
      const manifest = record.manifest;
      await settingsStore.setActiveThemePresetForTarget(target, record.id);
      if (target === 'app' && manifest.scopes.app !== false && manifest.app) {
        applyActiveThemePackToDocument(manifest);
        publishActiveThemePack(manifest);
      }
      if (target === 'module.reading' && manifest.scopes.viewer !== false && manifest.viewer) {
        publishActiveViewerThemePack(manifest);
      }
      if (target !== 'app' && target !== 'module.reading') {
        publishActiveThemeTargetPack(target, manifest);
      }
      showAppToast({ title: `已为${label}应用「${record.name}」` });
    } finally {
      setApplyingId(null);
    }
  };
  const clearTargetPreset = async (
    target: 'module.reading',
    label: string,
  ) => {
    setApplyingId(`${target}:follow-parent`);
    try {
      await settingsStore.clearActiveThemePresetForTarget(target);
      publishActiveThemeTargetPack(target, null);
      showAppToast({ title: `${label}已跟随主程序主题` });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div class="space-y-1">
          <h3 class="font-semibold text-foreground">主题预设</h3>
          <p class="text-sm text-muted-foreground">
            快速切换已保存的主题包（含组件背景、语义色与特效）
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 cursor-pointer gap-1.5"
          onClick={() => setManageOpen(true)}
        >
          <FolderTreeIcon class="h-4 w-4" />
          管理
        </Button>
      </div>

      <Show when={loading()}>
        <p class="text-sm text-muted-foreground">加载预设中…</p>
      </Show>

      <Show when={!loading() && presets().length === 0}>
        <p class="text-sm text-muted-foreground">暂无主题预设，可在主题工作室创建并保存。</p>
      </Show>

      <Show when={!loading()}>
        <div class="space-y-5">
          <For each={QUICK_THEME_TARGETS}>
            {(target) => (
              <section class="space-y-2">
                <div>
                  <h4 class="text-sm font-medium text-foreground">{target.label}</h4>
                  <p class="text-xs text-muted-foreground">{target.description}</p>
                </div>
                <Show
                  when={presetsForTarget(target.id).length > 0}
                  fallback={<p class="text-xs text-muted-foreground">暂无适用于此层级的主题。</p>}
                >
                  <ul class="flex flex-col gap-2">
                    <Show when={target.id !== 'app'}>
                      <li>
                        <button
                          type="button"
                          disabled={applyingId() === `${target.id}:follow-parent`}
                          class={cn(
                            'flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            targetUsesParentTheme(target.id)
                              ? 'border-primary/50 bg-primary/10'
                              : 'border-border/50 bg-background hover:bg-accent/40',
                          )}
                          onClick={() =>
                            void clearTargetPreset(
                              target.id as 'module.reading',
                              target.label,
                            )
                          }
                        >
                          <span
                            class="relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-xs font-semibold shadow-sm"
                            style={{
                              'background-color': 'hsl(var(--background))',
                              color: 'hsl(var(--foreground))',
                            }}
                          >
                            Aa
                            <span
                              class="absolute inset-x-0 bottom-0 h-1.5"
                              style={{ 'background-color': 'hsl(var(--primary))' }}
                            />
                          </span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate font-medium text-foreground">默认主题</span>
                            <span class="block truncate text-xs text-muted-foreground">
                              跟随主程序
                            </span>
                          </span>
                          <Show when={targetUsesParentTheme(target.id)}>
                            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <CheckIcon class="h-4 w-4" />
                            </span>
                          </Show>
                        </button>
                      </li>
                    </Show>
                    <For each={presetsForTarget(target.id)}>
                      {(record) => {
                        const active = () => isActive(record, target.id);
                        const busy = () => applyingId() === `${target.id}:${record.id}`;
                        const preview = () => previewForTarget(record, target.id);
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
                              onClick={() => void applyPreset(record, target.id, target.label)}
                            >
                              <span
                                class="relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border text-xs font-semibold shadow-sm"
                                style={{
                                  'background-color': preview()?.background ?? 'hsl(var(--background))',
                                  color: preview()?.foreground ?? 'hsl(var(--foreground))',
                                }}
                              >
                                Aa
                                <span
                                  class="absolute inset-x-0 bottom-0 h-1.5"
                                  style={{
                                    'background-color': preview()?.primary ?? 'hsl(var(--primary))',
                                  }}
                                />
                              </span>
                              <span class="min-w-0 flex-1">
                                <span class="block truncate font-medium text-foreground">{record.name}</span>
                                <span class="block truncate text-xs text-muted-foreground">
                                  {PRESET_KIND_LABEL[record.kind]} · {target.label}
                                </span>
                              </span>
                              <Show when={!active()}>
                                <span class="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                  应用
                                </span>
                              </Show>
                              <Show when={active()}>
                                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <CheckIcon class="h-4 w-4" />
                                </span>
                              </Show>
                            </button>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </Show>
              </section>
            )}
          </For>
        </div>
      </Show>

      <ThemePresetManageDialog
        open={manageOpen()}
        onOpenChange={setManageOpen}
        onPresetsChange={() => void reload()}
      />
    </div>
  );
}
