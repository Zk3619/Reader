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
      <h3 class="font-medium">桌面悬浮歌词</h3>
      <Show when={isTauri() && !isAndroid()}>
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
            鼠标穿透（点击歌词窗不拦截操作）
          </Label>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">默认歌词轨：</span>
          <MusicAppSelect
            value={settings().desktopLyricTrack ?? settings().lyricTrack}
            onChange={(v) => apply({ desktopLyricTrack: v as LyricTrackKind })}
            options={LYRIC_TRACKS}
            optionLabel={(v) => LYRIC_TRACK_LABELS[v]}
            triggerClass="w-28"
            aria-label="默认歌词轨"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground">歌词对齐：</span>
          <MusicAppSelect
            value={settings().desktopLyricAlign}
            onChange={(v) => apply({ desktopLyricAlign: v as MusicLyricAlign })}
            options={LYRIC_ALIGNS}
            optionLabel={(v) =>
              v === 'left' ? '左对齐' : v === 'right' ? '右对齐' : '居中'
            }
            triggerClass="w-28"
            aria-label="桌面歌词对齐"
          />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-desktop-lyric-zoom-active-input"
            checked={settings().desktopLyricZoomActive}
            onChange={(checked) => apply({ desktopLyricZoomActive: checked })}
          />
          <Label for="music-desktop-lyric-zoom-active-input">放大当前歌词行</Label>
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
          <span class="text-muted-foreground">当前行颜色：</span>
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
          <span class="text-muted-foreground">字号：</span>
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
