/**
 * 桌面悬浮歌词设置（对齐 lx winLyric）
 */

import { createSignal, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { isTauri, isAndroid } from '@/lib/platform/detect';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import type { MusicLyricAlign } from '@/lib/media/audio/music-settings';
import {
  NumberField,
  NumberFieldInput,
} from '@/components/ui/number-field';
import { AppTextFieldBareInput } from '@/components/shared/AppTextField';

const LYRIC_TRACKS = ['lyric', 'tlyric', 'rlyric', 'lxlyric'] as const;
const LYRIC_TRACK_LABELS: Record<(typeof LYRIC_TRACKS)[number], string> = {
  lyric: '原文',
  tlyric: '翻译',
  rlyric: '罗马音',
  lxlyric: '逐字',
};
const LYRIC_ALIGNS: MusicLyricAlign[] = ['left', 'center', 'right'];
const DIRECTIONS = ['horizontal', 'vertical'] as const;
const SCROLL_POSITIONS = ['top', 'center', 'bottom'] as const;

export const MusicSettingsDesktopLyric: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const apply = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  const openLyric = async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_desktop_lyric_window');
  };

  const closeLyric = async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('close_desktop_lyric_window');
  };

  const setPenetrate = async (ignore: boolean) => {
    apply({ desktopLyricPenetrate: ignore });
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_desktop_lyric_ignore_cursor', { ignore });
  };

  const applyWindowOptions = async (patch: Parameters<typeof setMusicSettings>[0]) => {
    apply(patch);
    if (!isTauri()) return;
    const next = getMusicSettings();
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_desktop_lyric_window_options', {
      alwaysOnTop: next.desktopLyricAlwaysOnTop,
      locked: next.desktopLyricLocked,
    }).catch(() => undefined);
  };

  const resetWindowGeometry = async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reset_desktop_lyric_window_geometry');
  };

  const requestOverlayPermission = async () => {
    if (!isAndroid()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('request_android_overlay_permission');
    } catch {
      /* plugin may be unavailable */
    }
  };

  return (
    <div class="space-y-4 p-4 text-sm">
      <h2 class="text-base font-semibold">桌面歌词设置</h2>
      <Show when={isTauri() && !isAndroid()}>
        <div>
          <h3 class="font-medium">Reader 平台控制 · 桌面歌词窗口</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            Reader 通过 Tauri 独立窗口提供桌面歌词；打开、关闭与鼠标穿透不是 LX
            Music 设置原项。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void openLyric()}>
            打开
          </Button>
          <Button size="sm" variant="outline" onClick={() => void closeLyric()}>
            关闭
          </Button>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-desktop-lyric-penetrate-input"
            checked={settings().desktopLyricPenetrate ?? false}
            onChange={(checked) => void setPenetrate(checked)}
          />
          <Label for="music-desktop-lyric-penetrate-input">
            鼠标穿透
          </Label>
        </div>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2">
            <Checkbox
              checked={settings().desktopLyricLocked}
              onChange={(checked) => void applyWindowOptions({ desktopLyricLocked: checked })}
            />
            <span>锁定歌词</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox
              checked={settings().desktopLyricAlwaysOnTop}
              onChange={(checked) => void applyWindowOptions({ desktopLyricAlwaysOnTop: checked })}
            />
            <span>使歌词总是在其他窗口之上</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox
              checked={settings().desktopLyricHideWhenPaused}
              onChange={(checked) => apply({ desktopLyricHideWhenPaused: checked })}
            />
            <span>暂停时隐藏歌词（Reader 行为）</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox
              checked={settings().desktopLyricHideWhenFullscreen}
              onChange={(checked) => apply({ desktopLyricHideWhenFullscreen: checked })}
            />
            <span>全屏时自动关闭歌词</span>
          </label>
        </div>
        <p class="text-xs text-muted-foreground">
          LX Music 的暂停选项会提高歌词透明度；Reader 当前实现为隐藏歌词，故单独标注。
        </p>
        <h3 class="border-t pt-4 font-medium">Reader 扩展 · 歌词内容</h3>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">桌面歌词轨：</span>
          <MusicAppSelect
            value={settings().desktopLyricTrack ?? settings().lyricTrack}
            onChange={(v) => apply({ desktopLyricTrack: v as LyricTrackKind })}
            options={LYRIC_TRACKS}
            optionLabel={(v) => LYRIC_TRACK_LABELS[v]}
            triggerClass="w-28"
            aria-label="桌面歌词轨"
          />
        </div>
        <h3 class="border-t pt-4 font-medium">歌词布局</h3>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">歌词显示方向：</span>
          <MusicAppSelect
            value={settings().desktopLyricDirection}
            onChange={(value) => apply({ desktopLyricDirection: value })}
            options={DIRECTIONS}
            optionLabel={(value) =>
              value === 'vertical' ? '垂直方向' : '水平方向'
            }
            triggerClass="w-24"
            aria-label="桌面歌词方向"
          />
          <span class="text-muted-foreground">正在播放歌词滚动位置：</span>
          <MusicAppSelect
            value={settings().desktopLyricScrollPosition}
            onChange={(value) => apply({ desktopLyricScrollPosition: value })}
            options={SCROLL_POSITIONS}
            optionLabel={(value) =>
              value === 'top' ? '顶部' : value === 'bottom' ? '底部（Reader 扩展）' : '中心'
            }
            triggerClass="w-24"
            aria-label="桌面歌词滚动位置"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">歌词对齐方式：</span>
          <MusicAppSelect
            value={settings().desktopLyricAlign}
            onChange={(v) => apply({ desktopLyricAlign: v as MusicLyricAlign })}
            options={LYRIC_ALIGNS}
            optionLabel={(v) =>
              v === 'left' ? '居左' : v === 'right' ? '居右' : '居中'
            }
            triggerClass="w-28"
            aria-label="桌面歌词对齐"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">歌词字体：</span>
          <AppTextFieldBareInput
            class="w-48"
            placeholder="默认"
            value={settings().desktopLyricFontFamily}
            onInput={(event) => apply({ desktopLyricFontFamily: event.currentTarget.value })}
          />
          <span class="text-muted-foreground">歌词间距：</span>
          <NumberField
            rawValue={settings().desktopLyricLineHeight}
            onRawValueChange={(value) => apply({ desktopLyricLineHeight: value })}
            minValue={1}
            maxValue={3}
            step={0.1}
          >
            <NumberFieldInput class="w-20" aria-label="桌面歌词行距" />
          </NumberField>
        </div>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2">
            <Checkbox checked={settings().desktopLyricShadow} onChange={(checked) => apply({ desktopLyricShadow: checked })} />
            <span>歌词阴影</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox checked={settings().desktopLyricBold} onChange={(checked) => apply({ desktopLyricBold: checked })} />
            <span>加粗字体</span>
          </label>
          <label class="flex items-center gap-2">
            <Checkbox
              checked={!settings().desktopLyricWrap}
              onChange={(checked) => apply({ desktopLyricWrap: !checked })}
            />
            <span>不允许歌词换行</span>
          </label>
        </div>
        <Button size="sm" variant="outline" onClick={() => void resetWindowGeometry()}>
          重置窗口设置
        </Button>
        <p class="text-xs text-muted-foreground">
          Reader 平台限制：Windows/macOS/Linux 支持锁定、置顶和窗口设置重置；任务栏显示、
          自动刷新置顶与锁屏边界限制当前不提供。
        </p>
        <h3 class="border-t pt-4 font-medium">Reader 扩展 · 显示细节</h3>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-desktop-lyric-zoom-active-input"
            checked={settings().desktopLyricZoomActive}
            onChange={(checked) => apply({ desktopLyricZoomActive: checked })}
          />
          <Label for="music-desktop-lyric-zoom-active-input">
            缩放当前播放的歌词
          </Label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-desktop-lyric-single-line-input"
            checked={settings().desktopLyricSingleLine}
            onChange={(checked) => apply({ desktopLyricSingleLine: checked })}
          />
          <Label for="music-desktop-lyric-single-line-input">仅显示当前歌词行</Label>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">最多显示行数：</span>
          <NumberField
            rawValue={settings().desktopLyricMaxLines}
            onRawValueChange={(value) => apply({ desktopLyricMaxLines: value })}
            minValue={1}
            maxValue={8}
            disabled={settings().desktopLyricSingleLine}
          >
            <NumberFieldInput class="w-20" aria-label="桌面歌词最大行数" />
          </NumberField>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">已播放颜色：</span>
          <AppTextFieldBareInput
            class="w-40 font-mono text-xs"
            value={settings().desktopLyricPlayedColor}
            onInput={(event) =>
              apply({ desktopLyricPlayedColor: event.currentTarget.value })
            }
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">未播放颜色：</span>
          <AppTextFieldBareInput
            class="w-40 font-mono text-xs"
            value={settings().desktopLyricUnplayedColor}
            onInput={(event) =>
              apply({ desktopLyricUnplayedColor: event.currentTarget.value })
            }
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">歌词字体大小：</span>
          <Slider
            class="w-40"
            minValue={12}
            maxValue={48}
            step={1}
            value={[settings().desktopLyricFontSize ?? 20]}
            onChange={(v) => apply({ desktopLyricFontSize: v[0] ?? 20 })}
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
          <span class="tabular-nums">{settings().desktopLyricFontSize ?? 20}px</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">不透明度：</span>
          <Slider
            class="w-40"
            minValue={20}
            maxValue={100}
            step={1}
            value={[Math.round((settings().desktopLyricOpacity ?? 0.85) * 100)]}
            onChange={(v) => apply({ desktopLyricOpacity: (v[0] ?? 85) / 100 })}
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </div>
      </Show>
      <Show when={isAndroid()}>
        <section class="space-y-2 rounded border p-3">
          <p class="text-muted-foreground">
            Android 悬浮歌词需「显示在其他应用上层」权限。
          </p>
          <Button size="sm" variant="outline" onClick={() => void requestOverlayPermission()}>
            申请悬浮窗权限
          </Button>
        </section>
      </Show>
      <Show when={!isTauri()}>
        <p class="text-muted-foreground">桌面悬浮歌词仅 Tauri 客户端可用。</p>
      </Show>
    </div>
  );
};
