/**
 * 桌面悬浮歌词设置（对齐 lx SettingDesktopLyric 布局与选项）
 */

import { createSignal, For, onCleanup, onMount, Show, type Component, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  clampVisualizerFps,
  VISUALIZER_FPS_MAX,
  VISUALIZER_FPS_MIN,
} from '@/lib/media/audio/music-audio-visualizer-fps';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { isTauri, isAndroid, isLinux } from '@/lib/platform/detect';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicLyricAlign,
  type MusicLyricDirection,
  type MusicLyricLayout,
  type MusicLyricScrollPosition,
  type MusicDesktopLyricLockScreenBounds,
  type MusicDesktopLyricMetaColorMode,
} from '@/lib/media/audio/music-settings';
import {
  MusicDesktopLyricMetaColorSection,
  desktopLyricMetaColorsFromLyricPreset,
} from '@/components/media/viewer/audio/music/settings/MusicDesktopLyricMetaColorSection';
import {
  desktopLyricColorPatchFromPreset,
  type MusicLyricColorPresetId,
  type MusicLyricCustomPreset,
} from '@/lib/media/audio/music-lyric-color-presets';
import { MusicLyricColorPresetSection } from '@/components/media/viewer/audio/music/settings/MusicLyricColorPresetSection';
import type { MusicFontSizeUnit } from '@/lib/media/audio/play-detail-lyric-font';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
import { listSystemFontFamilies } from '@/lib/settings/main-program-settings';
import { syncDesktopLyricWindowOptions } from '@/lib/media/audio/desktop-lyric-window';
import {
  MusicDesktopLyricFontSizeField,
  MusicDesktopLyricLineGapField,
  MusicDesktopLyricMaxLinesField,
  MusicDesktopLyricMetaFontSizeField,
  MusicDesktopLyricPercentField,
  MusicDesktopLyricZoomScaleField,
} from '@/components/media/viewer/audio/music/settings/MusicDesktopLyricSettingFields';

function SettingRow(props: {
  id: string;
  label: string;
  checked: boolean;
  tip?: string;
  onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <Checkbox id={props.id} checked={props.checked} onChange={props.onChange} />
      <Label for={props.id}>{props.label}</Label>
      <Show when={props.tip}>
        <AppTooltip>
          <AppTooltipTrigger
            as="button"
            type="button"
            class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-[10px] text-muted-foreground"
            aria-label={props.tip}
          >
            ?
          </AppTooltipTrigger>
          <AppTooltipContent class="max-w-xs text-xs">{props.tip}</AppTooltipContent>
        </AppTooltip>
      </Show>
    </div>
  );
}

function RadioRow<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}): JSX.Element {
  return (
    <section class="space-y-2">
      <h3 class="font-medium">{props.label}</h3>
      <div class="flex flex-wrap gap-4">
        <For each={props.options}>
          {(opt) => (
            <div class="flex items-center gap-2">
              <Checkbox
                id={`music-desktop-lyric-radio-${props.label}-${opt.value}`}
                checked={props.value === opt.value}
                onChange={(checked) => {
                  if (checked) props.onChange(opt.value);
                }}
              />
              <Label for={`music-desktop-lyric-radio-${props.label}-${opt.value}`}>
                {opt.label}
              </Label>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

const FONT_DEFAULT_VALUE = '__desktop_lyric_font_default__';

export const MusicSettingsDesktopLyric: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [fontList, setFontList] = createSignal<string[]>([FONT_DEFAULT_VALUE]);

  onMount(() => {
    void listSystemFontFamilies().then((fonts) => {
      setFontList([FONT_DEFAULT_VALUE, ...fonts]);
    });
    // 桌面歌词窗改设置时，经 music-settings-changed 同步回本页
    const unsub = subscribeMusicSettings((next) => setLocal(next));
    onCleanup(unsub);
  });

  const apply = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  const toggleEnable = async (enabled: boolean) => {
    if (!isTauri()) {
      apply({ desktopLyricEnabled: enabled });
      return;
    }
    try {
      const { setDesktopLyricEnabled } = await import('@/lib/media/audio/desktop-lyric-window');
      await setDesktopLyricEnabled(enabled);
    } catch (err) {
      console.warn('[desktop-lyric] toggle failed', err);
    }
    setLocal(getMusicSettings());
  };

  const setPenetrate = async (enabled: boolean) => {
    apply({ desktopLyricPenetrate: enabled });
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    const next = getMusicSettings();
    await invoke('set_desktop_lyric_penetrate_mode', {
      enabled,
      ignoreChrome: next.desktopLyricPenetrateIgnoreChrome ?? false,
    });
  };

  const setPenetrateIgnoreChrome = async (ignoreChrome: boolean) => {
    apply({ desktopLyricPenetrateIgnoreChrome: ignoreChrome });
    if (!isTauri()) return;
    const next = getMusicSettings();
    if (!next.desktopLyricPenetrate) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_desktop_lyric_penetrate_mode', {
      enabled: true,
      ignoreChrome,
    });
  };

  const applyWindowOptions = async (patch: Parameters<typeof setMusicSettings>[0]) => {
    if ('desktopLyricLocked' in patch && typeof patch.desktopLyricLocked === 'boolean') {
      const { setDesktopLyricLocked } = await import('@/lib/media/audio/desktop-lyric-window');
      await setDesktopLyricLocked(patch.desktopLyricLocked);
      // 锁定可能与其它窗口选项一并传入；locked 已即时处理，其余继续走下方同步
      const rest = { ...patch };
      delete rest.desktopLyricLocked;
      if (Object.keys(rest).length === 0) return;
      apply(rest);
    } else {
      apply(patch);
    }
    await syncDesktopLyricWindowOptions({
      ...('desktopLyricAlwaysOnTop' in patch
        ? { alwaysOnTop: patch.desktopLyricAlwaysOnTop as boolean }
        : {}),
      ...('desktopLyricShowTaskbar' in patch
        ? { showTaskbar: patch.desktopLyricShowTaskbar as boolean }
        : {}),
      ...('desktopLyricAlwaysOnTopLoop' in patch
        ? { alwaysOnTopLoop: patch.desktopLyricAlwaysOnTopLoop as boolean }
        : {}),
      ...('desktopLyricLockScreen' in patch
        ? { lockScreen: patch.desktopLyricLockScreen as boolean }
        : {}),
      ...('desktopLyricLockScreenBounds' in patch
        ? {
            lockScreenUseWorkArea:
              (patch.desktopLyricLockScreenBounds as MusicDesktopLyricLockScreenBounds) !==
              'screen',
          }
        : {}),
    });
    if (patch.desktopLyricLockScreen || patch.desktopLyricLockScreenBounds) {
      const { clampDesktopLyricToScreen } = await import('@/lib/media/audio/desktop-lyric-window');
      await clampDesktopLyricToScreen();
    }
  };

  const applyLayout = (layout: MusicLyricLayout) => {
    const patch: Parameters<typeof setMusicSettings>[0] = {
      desktopLyricLayout: layout,
      desktopLyricSingleLine: layout === 'single',
    };
    if (layout !== 'dual' && settings().desktopLyricAlign === 'justify') {
      patch.desktopLyricAlign = 'center';
    }
    apply(patch);
  };

  const alignOptions = (): { value: MusicLyricAlign; label: string }[] => {
    const base: { value: MusicLyricAlign; label: string }[] = [
      { value: 'left', label: '居左' },
      { value: 'center', label: '居中' },
      { value: 'right', label: '居右' },
    ];
    if (settings().desktopLyricLayout === 'dual') {
      base.push({ value: 'justify', label: '两端对齐' });
    }
    return base;
  };

  const resetWindowGeometry = async () => {
    apply({
      desktopLyricWidth: 600,
      desktopLyricHeight: 200,
      desktopLyricX: undefined,
      desktopLyricY: undefined,
    });
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reset_desktop_lyric_window_geometry').catch(() => undefined);
  };

  const requestOverlayPermission = async () => {
    const { promptMobileOverlayPermission } = await import(
      '@/lib/media/audio/mobile-desktop-lyric'
    );
    await promptMobileOverlayPermission();
  };

  return (
    <div class="space-y-5 p-4 text-sm">
      <h2 class="text-base font-semibold">桌面歌词设置</h2>

      <Show when={isTauri() && !isAndroid()}>
        <section class="space-y-3">
          <h3 class="font-medium">窗口与显示</h3>
          <SettingRow
            id="music-desktop-lyric-enable-input"
            label="显示歌词"
            checked={settings().desktopLyricEnabled}
            onChange={(checked) => void toggleEnable(checked)}
          />
          <SettingRow
            id="music-desktop-lyric-locked-input"
            label="锁定歌词"
            checked={settings().desktopLyricLocked}
            onChange={(checked) => void applyWindowOptions({ desktopLyricLocked: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-hide-when-fullscreen-input"
            label="全屏时自动关闭歌词"
            checked={settings().desktopLyricHideWhenFullscreen}
            onChange={(checked) => apply({ desktopLyricHideWhenFullscreen: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-hide-when-paused-input"
            label="暂停时提高歌词透明度"
            checked={settings().desktopLyricHideWhenPaused}
            onChange={(checked) => apply({ desktopLyricHideWhenPaused: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-audio-vis-input"
            label="音频可视化（实验性）"
            checked={settings().desktopLyricAudioVisualization}
            onChange={(checked) => apply({ desktopLyricAudioVisualization: checked })}
          />
          <Show when={settings().desktopLyricAudioVisualization}>
            <div class="space-y-1 pl-6">
              <Label for="music-desktop-lyric-visualizer-fps-input">频谱帧率</Label>
              <div class="flex flex-wrap items-center gap-2">
                <MusicSettingsNumberInput
                  id="music-desktop-lyric-visualizer-fps-input"
                  value={settings().desktopLyricAudioVisualizerFps}
                  min={VISUALIZER_FPS_MIN}
                  max={VISUALIZER_FPS_MAX}
                  step={1}
                  class="w-28"
                  aria-label="桌面歌词频谱帧率"
                  normalize={(n) => clampVisualizerFps(n)}
                  onCommit={(value) =>
                    apply({ desktopLyricAudioVisualizerFps: value })
                  }
                />
                <span class="text-sm text-muted-foreground">fps</span>
              </div>
              <p class="text-xs text-muted-foreground">
                桌面歌词窗口频谱 IPC 帧率，默认 60 fps（15–120）。
              </p>
            </div>
          </Show>
          <SettingRow
            id="music-desktop-lyric-delay-scroll-input"
            label="延迟歌词滚动"
            tip="切到下一行后再延迟滚动到当前行"
            checked={settings().desktopLyricDelayScroll}
            onChange={(checked) =>
              apply({
                desktopLyricDelayScroll: checked,
                ...(checked &&
                (!settings().desktopLyricScrollDelayMs ||
                  settings().desktopLyricScrollDelayMs < 100)
                  ? { desktopLyricScrollDelayMs: 600 }
                  : {}),
              })
            }
          />
          <Show when={settings().desktopLyricDelayScroll}>
            <div class="ml-6 flex flex-wrap items-center gap-2">
              <span class="text-muted-foreground">延迟时间：</span>
              <MusicSettingsNumberInput
                value={settings().desktopLyricScrollDelayMs || 600}
                min={100}
                max={5000}
                step={100}
                class="w-24"
                aria-label="桌面歌词延迟滚动毫秒"
                normalize={(n) => Math.round(n)}
                onCommit={(value) =>
                  apply({ desktopLyricScrollDelayMs: Math.max(100, value) })
                }
              />
              <span class="text-muted-foreground">毫秒</span>
            </div>
          </Show>
          <SettingRow
            id="music-desktop-lyric-always-on-top-input"
            label="使歌词总是在其他窗口之上"
            checked={settings().desktopLyricAlwaysOnTop}
            onChange={(checked) => void applyWindowOptions({ desktopLyricAlwaysOnTop: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-show-taskbar-input"
            label="在任务栏显示歌词进程"
            tip="此选项作为在录屏软件无法捕获歌词窗口时的变通解决方法"
            checked={settings().desktopLyricShowTaskbar}
            onChange={(checked) => void applyWindowOptions({ desktopLyricShowTaskbar: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-always-on-top-loop-input"
            label="自动刷新歌词置顶"
            tip="当歌词置顶后仍被某些程序遮挡时可尝试启用此选项"
            checked={settings().desktopLyricAlwaysOnTopLoop}
            onChange={(checked) =>
              void applyWindowOptions({ desktopLyricAlwaysOnTopLoop: checked })
            }
          />
          <SettingRow
            id="music-desktop-lyric-lock-screen-input"
            label="不允许歌词窗口拖出主屏幕之外"
            checked={settings().desktopLyricLockScreen}
            onChange={(checked) => void applyWindowOptions({ desktopLyricLockScreen: checked })}
          />
          <Show when={settings().desktopLyricLockScreen}>
            <RadioRow<MusicDesktopLyricLockScreenBounds>
              label="主屏幕下边界"
              value={settings().desktopLyricLockScreenBounds ?? 'workArea'}
              options={[
                { value: 'workArea', label: '系统任务栏之上（工作区）' },
                { value: 'screen', label: '真实屏幕边缘' },
              ]}
              onChange={(value) => void applyWindowOptions({ desktopLyricLockScreenBounds: value })}
            />
          </Show>
          <Show when={!isLinux()}>
            <SettingRow
              id="music-desktop-lyric-hover-hide-input"
              label="鼠标移入歌词区域时提高歌词透明度"
              tip="此功能存在平台兼容性问题，在某些平台上可能会出现预料外的问题"
              checked={settings().desktopLyricHoverHide}
              onChange={(checked) => apply({ desktopLyricHoverHide: checked })}
            />
          </Show>
          <SettingRow
            id="music-desktop-lyric-no-wrap-input"
            label="不允许歌词换行"
            checked={!settings().desktopLyricWrap}
            onChange={(checked) => apply({ desktopLyricWrap: !checked })}
          />
          <SettingRow
            id="music-desktop-lyric-zoom-active-input"
            label="缩放当前播放的歌词"
            checked={settings().desktopLyricZoomActive}
            onChange={(checked) => apply({ desktopLyricZoomActive: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-penetrate-input"
            label="鼠标穿透"
            checked={settings().desktopLyricPenetrate ?? false}
            onChange={(checked) => void setPenetrate(checked)}
          />
          <Show when={settings().desktopLyricPenetrate}>
            <div class="ml-6 space-y-1 rounded-md border border-border/60 bg-muted/30 p-3">
              <SettingRow
                id="music-desktop-lyric-penetrate-ignore-chrome-input"
                label="无视顶栏"
                tip="整窗始终点击穿透，悬停不再显示控制栏（含锁定时的解锁按钮）。关闭穿透或解锁请回本页设置。"
                checked={settings().desktopLyricPenetrateIgnoreChrome ?? false}
                onChange={(checked) => void setPenetrateIgnoreChrome(checked)}
              />
            </div>
          </Show>
        </section>

        <section class="space-y-2 border-t pt-4">
          <h3 class="font-medium">加粗字体</h3>
          <div class="flex flex-wrap gap-4">
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-desktop-lyric-bold-font-input"
                checked={settings().desktopLyricBoldFont}
                onChange={(checked) => apply({ desktopLyricBoldFont: checked })}
              />
              <Label for="music-desktop-lyric-bold-font-input">逐字歌词</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-desktop-lyric-bold-line-input"
                checked={settings().desktopLyricBoldLine}
                onChange={(checked) => apply({ desktopLyricBoldLine: checked })}
              />
              <Label for="music-desktop-lyric-bold-line-input">逐行歌词</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-desktop-lyric-bold-extended-input"
                checked={settings().desktopLyricBoldExtended}
                onChange={(checked) => apply({ desktopLyricBoldExtended: checked })}
              />
              <Label for="music-desktop-lyric-bold-extended-input">翻译、罗马音歌词</Label>
            </div>
          </div>
        </section>

        <RadioRow
          label="歌词显示方向"
          value={settings().desktopLyricDirection}
          options={[
            { value: 'horizontal' as MusicLyricDirection, label: '水平方向' },
            { value: 'vertical' as MusicLyricDirection, label: '垂直方向' },
          ]}
          onChange={(value) => apply({ desktopLyricDirection: value })}
        />

        <RadioRow
          label="正在播放歌词滚动位置"
          value={
            settings().desktopLyricScrollPosition === 'bottom'
              ? 'center'
              : settings().desktopLyricScrollPosition
          }
          options={[
            { value: 'top' as MusicLyricScrollPosition, label: '顶部' },
            { value: 'center' as MusicLyricScrollPosition, label: '中心' },
          ]}
          onChange={(value) => apply({ desktopLyricScrollPosition: value })}
        />

        <RadioRow
          label="歌词布局"
          value={settings().desktopLyricLayout}
          options={[
            { value: 'default' as MusicLyricLayout, label: '默认' },
            { value: 'single' as MusicLyricLayout, label: '单行' },
            { value: 'dual' as MusicLyricLayout, label: '双行' },
          ]}
          onChange={(value) => applyLayout(value)}
        />
        <SettingRow
          id="music-desktop-lyric-compact-auto-shrink-input"
          label="切换至单行/双行时自动收缩至最小高度"
          tip="窗口高度收缩到刚好容纳歌词内容；切回默认布局或手动调整窗口大小后恢复原高度"
          checked={settings().desktopLyricCompactAutoShrink}
          onChange={(checked) => apply({ desktopLyricCompactAutoShrink: checked })}
        />

        <section class="space-y-2">
          <h3 class="font-medium">翻译与罗马音</h3>
          <p class="text-xs text-muted-foreground">
            仅作用于桌面歌词窗，与播放详情开关独立。默认布局在每行主歌词旁附带；单行在当前句旁附带；双行在上下两槽各自附带。
          </p>
          <SettingRow
            id="music-desktop-lyric-show-translation-input"
            label="显示翻译歌词（如果可用）"
            checked={settings().desktopLyricShowTranslation}
            onChange={(checked) => apply({ desktopLyricShowTranslation: checked })}
          />
          <SettingRow
            id="music-desktop-lyric-show-roma-input"
            label="显示罗马音歌词（如果可用）"
            checked={settings().desktopLyricShowRoma}
            onChange={(checked) => apply({ desktopLyricShowRoma: checked })}
          />
          <Show
            when={
              settings().desktopLyricShowTranslation || settings().desktopLyricShowRoma
            }
          >
            <RadioRow
              label="翻译/罗马音显示位置"
              value={settings().desktopLyricSecondaryPlacement}
              options={[
                { value: 'both-below' as const, label: '都在主歌词之下' },
                { value: 'both-above' as const, label: '都在主歌词之上' },
                {
                  value: 'roma-above-trans-below' as const,
                  label: '罗马音在上、翻译在下',
                },
                {
                  value: 'trans-above-roma-below' as const,
                  label: '翻译在上、罗马音在下',
                },
              ]}
              onChange={(value) => apply({ desktopLyricSecondaryPlacement: value })}
            />
            <Show
              when={
                settings().desktopLyricSecondaryPlacement === 'both-below' ||
                settings().desktopLyricSecondaryPlacement === 'both-above'
              }
            >
              <SettingRow
                id="music-desktop-lyric-secondary-order-input"
                label="罗马音显示在翻译歌词之前"
                tip="二者都在主歌词同侧时的上下顺序"
                checked={settings().desktopLyricSecondaryOrder === 'roma-first'}
                onChange={(checked) =>
                  apply({
                    desktopLyricSecondaryOrder: checked
                      ? 'roma-first'
                      : 'translation-first',
                  })
                }
              />
            </Show>
          </Show>
        </section>

        <RadioRow
          label="歌词对齐方式"
          value={settings().desktopLyricAlign}
          options={alignOptions()}
          onChange={(value) => apply({ desktopLyricAlign: value })}
        />

        <section class="space-y-2 border-t pt-4">
          <MusicDesktopLyricMaxLinesField
            value={settings().desktopLyricMaxLines}
            disabled={
              settings().desktopLyricLayout === 'single' ||
              settings().desktopLyricLayout === 'dual'
            }
            onChange={(value) => apply({ desktopLyricMaxLines: value })}
          />
          <MusicDesktopLyricLineGapField
            pxValue={settings().desktopLyricLineGap ?? 15}
            unit={settings().desktopLyricLineGapUnit ?? 'px'}
            onPxChange={(value) => apply({ desktopLyricLineGap: value })}
            onUnitChange={(unit) =>
              apply({ desktopLyricLineGapUnit: unit as MusicFontSizeUnit })
            }
          />
        </section>

        <section class="space-y-3 border-t pt-4">
          <h3 class="font-medium">歌词颜色</h3>
          <MusicLyricColorPresetSection
            context="desktop"
            presetId={settings().desktopLyricColorPreset}
            customPresets={settings().customLyricColorPresets}
            playedColor={settings().desktopLyricPlayedColor}
            unplayedColor={settings().desktopLyricUnplayedColor}
            unplayedShadow={settings().desktopLyricUnplayedShadow}
            unplayedShadowColor={settings().desktopLyricUnplayedShadowColor}
            playedShadow={settings().desktopLyricPlayedShadow}
            playedShadowColor={settings().desktopLyricPlayedShadowColor}
            onPresetChange={(id: MusicLyricColorPresetId, customPresetsOverride?: MusicLyricCustomPreset[]) => {
              const presets = customPresetsOverride ?? settings().customLyricColorPresets;
              apply({
                ...desktopLyricColorPatchFromPreset(id, settings(), presets),
                ...(customPresetsOverride ? { customLyricColorPresets: customPresetsOverride } : {}),
              });
            }}
            onCustomPresetsChange={(next: MusicLyricCustomPreset[]) =>
              apply({ customLyricColorPresets: next })
            }
            onPatch={(patch: {
              playedColor?: string;
              unplayedColor?: string;
              unplayedShadow?: boolean;
              unplayedShadowColor?: string;
              playedShadow?: boolean;
              playedShadowColor?: string;
            }) =>
              apply({
                ...(patch.playedColor !== undefined
                  ? { desktopLyricPlayedColor: patch.playedColor }
                  : {}),
                ...(patch.unplayedColor !== undefined
                  ? { desktopLyricUnplayedColor: patch.unplayedColor }
                  : {}),
                ...(patch.unplayedShadow !== undefined
                  ? {
                      desktopLyricUnplayedShadow: patch.unplayedShadow,
                      desktopLyricShadow: patch.unplayedShadow,
                    }
                  : {}),
                ...(patch.unplayedShadowColor !== undefined
                  ? {
                      desktopLyricUnplayedShadowColor: patch.unplayedShadowColor,
                      desktopLyricShadowColor: patch.unplayedShadowColor,
                    }
                  : {}),
                ...(patch.playedShadow !== undefined
                  ? { desktopLyricPlayedShadow: patch.playedShadow }
                  : {}),
                ...(patch.playedShadowColor !== undefined
                  ? { desktopLyricPlayedShadowColor: patch.playedShadowColor }
                  : {}),
              })
            }
          />
        </section>

        <section class="space-y-2 border-t pt-4">
          <h3 class="font-medium">歌词字体</h3>
          <MusicAppSelect
            value={settings().desktopLyricFontFamily || FONT_DEFAULT_VALUE}
            onChange={(value) =>
              apply({
                desktopLyricFontFamily:
                  value === FONT_DEFAULT_VALUE ? '' : value,
              })
            }
            options={fontList()}
            optionLabel={(value) =>
              value === FONT_DEFAULT_VALUE ? '默认' : value
            }
            triggerClass="w-56"
            aria-label="桌面歌词字体"
          />
          <MusicDesktopLyricFontSizeField
            pxValue={settings().desktopLyricFontSize ?? 20}
            unit={settings().desktopLyricFontSizeUnit ?? 'px'}
            onPxChange={(value) => apply({ desktopLyricFontSize: value })}
            onUnitChange={(unit) =>
              apply({ desktopLyricFontSizeUnit: unit as MusicFontSizeUnit })
            }
          />
          <MusicDesktopLyricPercentField
            label="不透明度"
            value={settings().desktopLyricOpacity ?? 0.85}
            minPercent={0}
            maxPercent={100}
            onChange={(value) => apply({ desktopLyricOpacity: value })}
            ariaLabel="桌面歌词不透明度"
          />
        </section>

        <section class="space-y-3 border-t pt-4">
          <h3 class="font-medium">显示细节</h3>
          <SettingRow
            id="music-desktop-lyric-show-meta-input"
            label="显示歌曲名和艺术家"
            checked={settings().desktopLyricShowMeta !== false}
            onChange={(checked) => apply({ desktopLyricShowMeta: checked })}
          />
          <Show when={settings().desktopLyricShowMeta !== false}>
            <div class="ml-6 space-y-3 rounded-md border border-border/60 bg-muted/30 p-3">
              <MusicDesktopLyricMetaFontSizeField
                pxValue={settings().desktopLyricMetaFontSize ?? 14}
                unit={settings().desktopLyricMetaFontSizeUnit ?? 'px'}
                onPxChange={(value) => apply({ desktopLyricMetaFontSize: value })}
                onUnitChange={(unit) =>
                  apply({ desktopLyricMetaFontSizeUnit: unit as MusicFontSizeUnit })
                }
              />
              <MusicDesktopLyricPercentField
                label="标题不透明度"
                value={settings().desktopLyricMetaOpacity ?? 0.7}
                minPercent={20}
                maxPercent={100}
                onChange={(value) => apply({ desktopLyricMetaOpacity: value })}
                ariaLabel="桌面歌词标题不透明度"
              />
              <SettingRow
                id="music-desktop-lyric-meta-bold-input"
                label="标题加粗"
                checked={settings().desktopLyricMetaBold}
                onChange={(checked) => apply({ desktopLyricMetaBold: checked })}
              />
              <MusicDesktopLyricMetaColorSection
                mode={settings().desktopLyricMetaColorMode ?? 'system'}
                color={settings().desktopLyricMetaColor || '#ffffff'}
                shadow={settings().desktopLyricMetaShadow === true}
                shadowColor={
                  settings().desktopLyricMetaShadowColor || 'rgba(0, 0, 0, 0.35)'
                }
                presetId={settings().desktopLyricMetaColorPreset || 'custom'}
                onModeChange={(mode: MusicDesktopLyricMetaColorMode) =>
                  apply({ desktopLyricMetaColorMode: mode })
                }
                onColorChange={(color) =>
                  apply({
                    desktopLyricMetaColor: color,
                    desktopLyricMetaColorPreset: 'custom',
                  })
                }
                onShadowChange={(enabled) => apply({ desktopLyricMetaShadow: enabled })}
                onShadowColorChange={(color) =>
                  apply({
                    desktopLyricMetaShadowColor: color,
                    desktopLyricMetaColorPreset: 'custom',
                  })
                }
                onPresetChange={(id) => {
                  const next = desktopLyricMetaColorsFromLyricPreset(id);
                  if (!next) return;
                  apply({
                    desktopLyricMetaColorMode: 'custom',
                    desktopLyricMetaColor: next.color,
                    desktopLyricMetaShadow: next.shadow,
                    desktopLyricMetaShadowColor: next.shadowColor,
                    desktopLyricMetaColorPreset: next.presetId,
                  });
                }}
              />
            </div>
          </Show>
          <Show when={settings().desktopLyricZoomActive}>
            <MusicDesktopLyricZoomScaleField
              scale={settings().desktopLyricZoomActiveScale ?? 1.28}
              onChange={(scale) => apply({ desktopLyricZoomActiveScale: scale })}
            />
          </Show>
        </section>

        <section class="space-y-2 border-t pt-4">
          <h3 class="font-medium">重置</h3>
          <Button size="sm" variant="outline" onClick={() => void resetWindowGeometry()}>
            重置窗口设置
          </Button>
        </section>
      </Show>

      <Show when={isAndroid()}>
        <section class="space-y-3 rounded border p-3">
          <h3 class="font-medium">悬浮歌词</h3>
          <p class="text-xs text-muted-foreground">
            使用系统悬浮窗显示当前歌词行（需「显示在其他应用上层」权限）。样式为桌面歌词设置的子集。
          </p>
          <SettingRow
            id="music-mobile-desktop-lyric-enable-input"
            label="显示歌词"
            checked={settings().desktopLyricEnabled}
            onChange={(checked) => void toggleEnable(checked)}
          />
          <SettingRow
            id="music-mobile-desktop-lyric-locked-input"
            label="锁定歌词"
            checked={settings().desktopLyricLocked}
            onChange={(checked) => {
              void import('@/lib/media/audio/desktop-lyric-window').then(({ setDesktopLyricLocked }) =>
                setDesktopLyricLocked(checked),
              );
            }}
          />
          <MusicDesktopLyricFontSizeField
            pxValue={settings().desktopLyricFontSize ?? 20}
            unit={settings().desktopLyricFontSizeUnit ?? 'px'}
            onPxChange={(value) => apply({ desktopLyricFontSize: value })}
            onUnitChange={(unit) =>
              apply({ desktopLyricFontSizeUnit: unit as MusicFontSizeUnit })
            }
          />
          <MusicDesktopLyricPercentField
            label="不透明度"
            value={settings().desktopLyricOpacity ?? 0.9}
            minPercent={20}
            maxPercent={100}
            onChange={(value) => apply({ desktopLyricOpacity: value })}
            ariaLabel="悬浮歌词不透明度"
          />
          <div class="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void requestOverlayPermission()}>
              申请悬浮窗权限
            </Button>
          </div>
        </section>
      </Show>
      <Show when={!isTauri()}>
        <p class="text-muted-foreground">桌面悬浮歌词仅 Tauri 客户端可用。</p>
      </Show>
    </div>
  );
};
