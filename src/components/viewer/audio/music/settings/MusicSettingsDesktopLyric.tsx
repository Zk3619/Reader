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
    const { setDesktopLyricEnabled } = await import('@/lib/media/audio/desktop-lyric-window');
    await setDesktopLyricEnabled(true);
  };

  const closeLyric = async () => {
    if (!isTauri()) return;
    const { setDesktopLyricEnabled } = await import('@/lib/media/audio/desktop-lyric-window');
    await setDesktopLyricEnabled(false);
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
    apply({
      desktopLyricWidth: 600,
      desktopLyricHeight: 200,
      desktopLyricX: undefined,
      desktopLyricY: undefined,
    });
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
          <h3 class="font-medium">桌面歌词窗口</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            通过独立窗口显示桌面歌词；可在此打开、关闭窗口，或开启鼠标穿透。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={settings().desktopLyricEnabled ? 'default' : 'outline'}
            onClick={() => void openLyric()}
          >
            {settings().desktopLyricEnabled ? '已打开' : '打开'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!settings().desktopLyricEnabled}
            onClick={() => void closeLyric()}
          >
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
        <Show when={settings().desktopLyricPenetrate}>
          <div class="ml-6 space-y-1 rounded-md border border-border/60 bg-muted/30 p-3">
            <p class="text-xs font-medium text-muted-foreground">高级</p>
            <div class="flex items-start gap-2">
              <Checkbox
                id="music-desktop-lyric-penetrate-ignore-chrome-input"
                class="mt-0.5"
                checked={settings().desktopLyricPenetrateIgnoreChrome ?? false}
                onChange={(checked) => void setPenetrateIgnoreChrome(checked)}
              />
              <div class="space-y-1">
                <Label for="music-desktop-lyric-penetrate-ignore-chrome-input">
                  无视顶栏
                </Label>
                <p class="text-xs text-muted-foreground">
                  整窗始终点击穿透，悬停不再显示控制栏（含锁定时的解锁按钮）。关闭穿透或解锁请回本页设置。
                </p>
              </div>
            </div>
          </div>
        </Show>
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
            <span>暂停时隐藏歌词</span>
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
          暂停时可选择隐藏歌词；全屏主窗口时也可自动隐藏。
        </p>
        <h3 class="border-t pt-4 font-medium">歌词内容</h3>
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
              value === 'top' ? '顶部' : value === 'bottom' ? '底部' : '中心'
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
          Windows / macOS / Linux 支持锁定、置顶与窗口设置重置。
        </p>
        <h3 class="border-t pt-4 font-medium">显示细节</h3>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-desktop-lyric-show-meta-input"
            checked={settings().desktopLyricShowMeta !== false}
            onChange={(checked) => apply({ desktopLyricShowMeta: checked })}
          />
          <Label for="music-desktop-lyric-show-meta-input">显示歌曲名和艺术家</Label>
        </div>
        <Show when={settings().desktopLyricShowMeta !== false}>
          <div class="ml-6 space-y-3 rounded-md border border-border/60 bg-muted/30 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-muted-foreground">标题字号：</span>
              <Slider
                class="w-40"
                minValue={10}
                maxValue={32}
                step={1}
                value={[settings().desktopLyricMetaFontSize ?? 14]}
                onChange={(v) => apply({ desktopLyricMetaFontSize: v[0] ?? 14 })}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="tabular-nums">{settings().desktopLyricMetaFontSize ?? 14}px</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-muted-foreground">标题不透明度：</span>
              <Slider
                class="w-40"
                minValue={20}
                maxValue={100}
                step={1}
                value={[Math.round((settings().desktopLyricMetaOpacity ?? 0.7) * 100)]}
                onChange={(v) => apply({ desktopLyricMetaOpacity: (v[0] ?? 70) / 100 })}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="tabular-nums">
                {Math.round((settings().desktopLyricMetaOpacity ?? 0.7) * 100)}%
              </span>
            </div>
            <label class="flex items-center gap-2">
              <Checkbox
                checked={settings().desktopLyricMetaBold}
                onChange={(checked) => apply({ desktopLyricMetaBold: checked })}
              />
              <span>标题加粗</span>
            </label>
          </div>
        </Show>
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
        <Show when={settings().desktopLyricZoomActive}>
          <div class="ml-6 flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">缩放幅度：</span>
            <Slider
              class="w-40"
              minValue={100}
              maxValue={160}
              step={1}
              value={[Math.round((settings().desktopLyricZoomActiveScale ?? 1.28) * 100)]}
              onChange={(v) =>
                apply({ desktopLyricZoomActiveScale: (v[0] ?? 128) / 100 })
              }
            >
              <SliderTrack>
                <SliderFill />
                <SliderThumb />
              </SliderTrack>
            </Slider>
            <span class="tabular-nums">
              {Math.round((settings().desktopLyricZoomActiveScale ?? 1.28) * 100)}%
            </span>
          </div>
        </Show>
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
            minValue={0}
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
