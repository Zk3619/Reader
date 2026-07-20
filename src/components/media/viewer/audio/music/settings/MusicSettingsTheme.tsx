import { createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from 'solid-js';
import { showAppToast } from '@/components/shared/AppToasts';
import { CheckIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import { ensureBuiltinThemePresets, listThemePresets } from '@/lib/database/theme-presets';
import {
  isMusicModuleBuiltinPresetId,
  isThemePresetApplicableToMusicModule,
} from '@/lib/theme/music-module-theme-presets';
import type { ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import type { ThemeTargetId } from '@/lib/theme/theme-targets';
import { onThemePresetsChanged } from '@/lib/theme/theme-preset-events';
import { getEffectiveDark, onDocumentColorModeChange } from '@/lib/theme/runtime';
import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import { cn } from '@/lib/utils';
import { settingsStore } from '@/stores/settings';
import { publishActiveThemeTargetPack } from '@/stores/theme-active-pack';

interface ThemeCardProps {
  name: string;
  preview?: { background: string; foreground: string; primary: string };
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const ThemeCard: Component<ThemeCardProps> = (props) => (
  <button
    type="button"
    aria-label={`应用主题：${props.name}`}
    title={props.name}
    disabled={props.disabled}
    class={cn(
      'group relative cursor-pointer rounded-xl border p-3 text-left transition-colors',
      props.active
        ? 'border-primary/60 bg-primary/10'
        : 'border-border/60 bg-background hover:border-primary/35 hover:bg-accent/40',
      props.disabled && 'cursor-wait opacity-65',
    )}
    onClick={props.onSelect}
  >
    <div
      class="relative flex h-16 w-full items-center justify-center overflow-hidden rounded-lg border border-black/10 text-sm font-semibold shadow-sm"
      style={{
        'background-color': props.preview?.background ?? 'hsl(var(--background))',
        color: props.preview?.foreground ?? 'hsl(var(--foreground))',
      }}
      aria-hidden="true"
    >
      <span class="max-w-[80%] truncate">{props.name}</span>
      <span
        class="absolute inset-x-0 bottom-0 h-2"
        style={{
          'background-color': props.preview?.primary ?? 'hsl(var(--primary))',
        }}
      />
      <Show when={props.active}>
        <span class="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon class="h-3.5 w-3.5" />
        </span>
      </Show>
    </div>
  </button>
);

export const MusicSettingsTheme: Component = () => {
  const [presets, setPresets] = createSignal<ThemePresetRecord[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [applyingId, setApplyingId] = createSignal<string | null>(null);
  const [dark, setDark] = createSignal(getEffectiveDark());

  const reload = async () => {
    setLoading(true);
    try {
      const records = await listThemePresets();
      setPresets(records);
      const activeId = settingsStore.state.app.activeThemePresetByTarget?.['module.music'];
      const activeRecord = records.find((record) => record.id === activeId);
      if (activeRecord) publishActiveThemeTargetPack('module.music', activeRecord.manifest);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    let disposed = false;
    let unsubscribe = () => {};
    const unsubscribeMode = onDocumentColorModeChange(setDark);
    void (async () => {
      await ensureBuiltinThemePresets();
      if (disposed) return;
      await reload();
      if (!disposed) unsubscribe = onThemePresetsChanged(() => void reload());
    })();
    onCleanup(() => {
      disposed = true;
      unsubscribe();
      unsubscribeMode();
    });
  });

  const explicitTargetPresetId = (target: ThemeTargetId) =>
    settingsStore.state.app.activeThemePresetByTarget?.[target];
  const explicitMusicPresetId = () => explicitTargetPresetId('module.music');
  const builtinPresets = createMemo(() =>
    presets().filter((preset) => isMusicModuleBuiltinPresetId(preset.id)),
  );
  const userPresets = createMemo(() =>
    presets().filter(
      (preset) => preset.kind !== 'builtin' && isThemePresetApplicableToMusicModule(preset),
    ),
  );
  const presetPreview = (record: ThemePresetRecord) => {
    const tokens = record.manifest.targets?.['module.music']?.tokens;
    const palette = dark() ? tokens?.dark : tokens?.light;
    if (!palette) return undefined;
    return {
      background: `hsl(${palette.background})`,
      foreground: `hsl(${palette.foreground})`,
      primary: `hsl(${palette.primary})`,
    };
  };
  const appThemePreview = () => {
    const activeAppId =
      settingsStore.state.app.activeThemePresetByTarget?.app ??
      settingsStore.state.app.activeThemePresetId;
    const activeAppPack = presets().find((record) => record.id === activeAppId)?.manifest;
    const tokens = activeAppPack?.app?.tokens ?? DEFAULT_APP_THEME;
    const palette = dark() ? tokens.dark : tokens.light;
    return {
      background: `hsl(${palette.background})`,
      foreground: `hsl(${palette.foreground})`,
      primary: `hsl(${palette.primary})`,
    };
  };

  const selectPreset = async (id?: string) => {
    if (applyingId()) return;
    if (id === explicitMusicPresetId() || (!id && !explicitMusicPresetId())) return;
    setApplyingId(id ?? 'follow-app');
    try {
      if (id) {
        const preset = presets().find((record) => record.id === id);
        if (!preset) throw new Error(`音乐主题不存在：${id}`);
        await settingsStore.setActiveThemePresetForTarget('module.music', id);
        publishActiveThemeTargetPack('module.music', preset.manifest);
      } else {
        await settingsStore.clearActiveThemePresetForTarget('module.music');
        publishActiveThemeTargetPack('module.music', null);
      }
      showAppToast({ title: id ? '已切换音乐主题' : '音乐主题已跟随主程序' });
    } finally {
      setApplyingId(null);
    }
  };

  const clearChildOverride = async (
    target: 'music.playDetail' | 'music.desktopLyric',
    label: string,
  ) => {
    await settingsStore.clearActiveThemePresetForTarget(target);
    showAppToast({ title: `${label}已恢复继承音乐主题` });
  };

  return (
    <div class="divide-y divide-border/60">
      <section class="space-y-4 p-4">
        <div>
          <h2 class="text-base font-semibold text-foreground">音乐主题</h2>
        </div>

        <Show when={loading()}>
          <p class="text-sm text-muted-foreground">加载音乐主题中…</p>
        </Show>

        <Show when={!loading()}>
          <div class="space-y-2">
            <h3 class="text-sm font-medium text-foreground">内置音乐主题</h3>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ThemeCard
                name="跟随主程序"
                preview={appThemePreview()}
                active={!explicitMusicPresetId()}
                disabled={applyingId() === 'follow-app'}
                onSelect={() => void selectPreset()}
              />
              <For each={builtinPresets()}>
                {(preset) => (
                  <ThemeCard
                    name={preset.name}
                    preview={presetPreview(preset)}
                    active={explicitMusicPresetId() === preset.id}
                    disabled={applyingId() === preset.id}
                    onSelect={() => void selectPreset(preset.id)}
                  />
                )}
              </For>
            </div>
          </div>

          <Show when={userPresets().length > 0}>
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-foreground">用户主题</h3>
              <p class="text-xs text-muted-foreground">仅显示包含 module.music 目标的 V3 主题。</p>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <For each={userPresets()}>
                  {(preset) => (
                    <ThemeCard
                      name={preset.name}
                      preview={presetPreview(preset)}
                      active={explicitMusicPresetId() === preset.id}
                      disabled={applyingId() === preset.id}
                      onSelect={() => void selectPreset(preset.id)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </section>

      <section class="space-y-3 p-4">
        <div>
          <h3 class="text-sm font-semibold text-foreground">子页面覆盖</h3>
          <p class="mt-1 text-xs leading-5 text-muted-foreground">
            显式覆盖会优先于音乐主题；恢复继承后将随 module.music 一起切换。
          </p>
        </div>
        <For
          each={[
            { target: 'music.playDetail' as const, label: '播放详情' },
            { target: 'music.desktopLyric' as const, label: '桌面歌词' },
          ]}
        >
          {(item) => {
            const overrideId = () => explicitTargetPresetId(item.target);
            return (
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-3">
                <div>
                  <p class="text-sm font-medium text-foreground">{item.label}</p>
                  <p class="text-xs text-muted-foreground">
                    {overrideId() ? `显式覆盖：${overrideId()}` : '继承音乐主题'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!overrideId()}
                  class="cursor-pointer"
                  onClick={() => void clearChildOverride(item.target, item.label)}
                >
                  恢复继承音乐主题
                </Button>
              </div>
            );
          }}
        </For>
      </section>
    </div>
  );
};
