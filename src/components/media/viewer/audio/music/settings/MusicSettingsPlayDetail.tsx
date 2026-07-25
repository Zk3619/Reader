import { createSignal, For, Show, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppSlider } from '@/components/shared/AppSlider';
import { MusicPlayDetailLyricFontSizeField } from '@/components/media/viewer/audio/music/settings/MusicPlayDetailLyricFontSizeField';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
import {
  getMusicSettings,
  setMusicSettings,
  type MusicLyricAlign,
} from '@/lib/media/audio/music-settings';
import {
  playDetailLyricColorPatchFromPreset,
  type MusicLyricColorPresetId,
  type MusicLyricCustomPreset,
} from '@/lib/media/audio/music-lyric-color-presets';
import { MusicLyricColorPresetSection } from '@/components/media/viewer/audio/music/settings/MusicLyricColorPresetSection';
import type { MusicFontSizeUnit } from '@/lib/media/audio/play-detail-lyric-font';

const ALIGN_OPTIONS: { value: MusicLyricAlign; label: string }[] = [
  { value: 'left', label: '居左' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '居右' },
];

export const MusicSettingsPlayDetail: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const apply = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-5 p-4 text-sm">
      <section class="space-y-4">
        <h2 class="text-base font-semibold">播放详情页设置</h2>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-standalone-input"
              checked={settings().playDetailStandalone}
              onChange={(checked) => apply({ playDetailStandalone: checked })}
            />
            <Label for="music-play-detail-standalone-input">独立展示</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后播放详情以全视口覆盖层展示，覆盖主壳顶栏与侧栏。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-hide-header-input"
              checked={settings().playDetailHideHeader}
              onChange={(checked) => apply({ playDetailHideHeader: checked })}
            />
            <Label for="music-play-detail-hide-header-input">隐藏顶栏</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            隐藏标题顶栏，将返回与设置按钮分布到内容顶部（对齐 LX Music 桌面端布局）。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-desktop-side-drawer-input"
              checked={settings().playDetailDesktopSidePaneDrawer}
              onChange={(checked) => apply({ playDetailDesktopSidePaneDrawer: checked })}
            />
            <Label for="music-play-detail-desktop-side-drawer-input">
              桌面端评论与播放队列使用右侧抽屉
            </Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后面板从右侧覆盖显示；关闭时使用可拖动分隔线的内嵌面板。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-blur-cover-input"
              checked={settings().playDetailBlurCoverBackground}
              onChange={(checked) => apply({ playDetailBlurCoverBackground: checked })}
            />
            <Label for="music-play-detail-blur-cover-input">以模糊封面作为背景</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后使用当前歌曲封面的模糊图作为播放详情背景，并按明暗主题叠加蒙层。
          </p>
        </div>
        <Show when={settings().playDetailBlurCoverBackground}>
          <div class="ml-6 flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">模糊程度：</span>
            <AppSlider
              class="w-40"
              min={0}
              max={100}
              step={1}
              value={settings().playDetailBlurCoverPx}
              aria-label="模糊程度"
              onChange={(n) => apply({ playDetailBlurCoverPx: n })}
            />
            <span class="tabular-nums">{settings().playDetailBlurCoverPx}px</span>
          </div>
          <div class="ml-6 flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">不透明度：</span>
            <AppSlider
              class="w-40"
              min={0}
              max={100}
              step={1}
              value={settings().playDetailBlurCoverOpacity}
              aria-label="不透明度"
              onChange={(n) => apply({ playDetailBlurCoverOpacity: n })}
            />
            <span class="tabular-nums">{settings().playDetailBlurCoverOpacity}%</span>
          </div>
        </Show>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-zoom-active-lyric-input"
            checked={settings().playDetailZoomActiveLyric}
            onChange={(checked) => apply({ playDetailZoomActiveLyric: checked })}
          />
          <Label for="music-play-detail-zoom-active-lyric-input">
            缩放当前正在播放的歌词
          </Label>
        </div>
        <Show when={settings().playDetailZoomActiveLyric}>
          <div class="ml-6 flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">缩放幅度：</span>
            <AppSlider
              class="w-40"
              min={100}
              max={160}
              step={1}
              value={Math.round((settings().playDetailZoomActiveScale ?? 1.28) * 100)}
              aria-label="歌词缩放幅度"
              onChange={(n) => apply({ playDetailZoomActiveScale: n / 100 })}
            />
            <span class="tabular-nums">
              {Math.round((settings().playDetailZoomActiveScale ?? 1.28) * 100)}%
            </span>
          </div>
        </Show>
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">延迟歌词滚动：</span>
            <MusicSettingsNumberInput
              value={settings().playDetailLyricScrollDelayMs}
              min={0}
              max={5000}
              step={100}
              class="w-24"
              aria-label="延迟歌词滚动毫秒"
              normalize={(n) => Math.round(n)}
              onCommit={(value) => apply({ playDetailLyricScrollDelayMs: value })}
            />
            <span class="text-muted-foreground">毫秒</span>
          </div>
          <p class="text-xs text-muted-foreground">
            切到下一行后再延迟滚动；设为 0 表示立即跟随。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-allow-lyric-seek-input"
              checked={settings().playDetailAllowLyricSeek}
              onChange={(checked) =>
                apply({
                  playDetailAllowLyricSeek: checked,
                  ...(checked
                    ? {}
                    : { playDetailLyricSeekAutoPlayOnRelease: false }),
                })
              }
            />
            <Label for="music-play-detail-allow-lyric-seek-input">
              允许通过拖拽歌词调整播放进度
            </Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后，手动浏览歌词时显示时间预览线，点击播放按钮跳转到对应位置。
          </p>
        </div>
        <div class="space-y-1 pl-6">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-lyric-seek-auto-release-input"
              checked={settings().playDetailLyricSeekAutoPlayOnRelease}
              disabled={!settings().playDetailAllowLyricSeek}
              onChange={(checked) =>
                apply({ playDetailLyricSeekAutoPlayOnRelease: checked })
              }
            />
            <Label for="music-play-detail-lyric-seek-auto-release-input">松开后自动跳转播放</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            启用后拖拽歌词并松手即跳转播放，无需再点播放按钮。默认关闭。
          </p>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-detail-lyric-dblclick-seek-input"
              checked={settings().playDetailLyricDoubleClickSeek}
              onChange={(checked) => apply({ playDetailLyricDoubleClickSeek: checked })}
            />
            <Label for="music-play-detail-lyric-dblclick-seek-input">双击歌词跳转到对应进度</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            启用后双击某一行歌词即可跳转到该行时间并开始播放。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-show-translation-input"
            checked={settings().showLyricTranslation !== false}
            onChange={(checked) => apply({ showLyricTranslation: checked })}
          />
          <Label for="music-play-detail-show-translation-input">显示翻译歌词</Label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-detail-show-roma-input"
            checked={settings().showLyricRoma !== false}
            onChange={(checked) => apply({ showLyricRoma: checked })}
          />
          <Label for="music-play-detail-show-roma-input">显示罗马音歌词</Label>
        </div>
      </section>

      <section class="space-y-3 border-t pt-4">
        <MusicLyricColorPresetSection
          context="play-detail"
          presetId={settings().playDetailLyricColorPreset}
          customPresets={settings().customLyricColorPresets}
          playedColor={settings().playDetailLyricPlayedColor}
          unplayedColor={settings().playDetailLyricUnplayedColor}
          unplayedShadow={settings().playDetailLyricUnplayedShadow}
          unplayedShadowColor={settings().playDetailLyricUnplayedShadowColor}
          playedShadow={settings().playDetailLyricPlayedShadow}
          playedShadowColor={settings().playDetailLyricPlayedShadowColor}
          onPresetChange={(id: MusicLyricColorPresetId, customPresetsOverride?: MusicLyricCustomPreset[]) => {
            const presets = customPresetsOverride ?? settings().customLyricColorPresets;
            apply({
              ...playDetailLyricColorPatchFromPreset(id, settings(), presets),
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
                ? { playDetailLyricPlayedColor: patch.playedColor }
                : {}),
              ...(patch.unplayedColor !== undefined
                ? { playDetailLyricUnplayedColor: patch.unplayedColor }
                : {}),
              ...(patch.unplayedShadow !== undefined
                ? { playDetailLyricUnplayedShadow: patch.unplayedShadow }
                : {}),
              ...(patch.unplayedShadowColor !== undefined
                ? { playDetailLyricUnplayedShadowColor: patch.unplayedShadowColor }
                : {}),
              ...(patch.playedShadow !== undefined
                ? { playDetailLyricPlayedShadow: patch.playedShadow }
                : {}),
              ...(patch.playedShadowColor !== undefined
                ? { playDetailLyricPlayedShadowColor: patch.playedShadowColor }
                : {}),
            })
          }
        />
      </section>

      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">歌词对齐方式</h2>
        <div class="flex flex-wrap gap-4">
          <For each={ALIGN_OPTIONS}>
            {(opt) => (
              <div class="flex items-center gap-2">
                <Checkbox
                  id={`music-play-detail-align-${opt.value}`}
                  checked={settings().playDetailLyricAlign === opt.value}
                  onChange={(checked) => {
                    if (checked) apply({ playDetailLyricAlign: opt.value });
                  }}
                />
                <Label for={`music-play-detail-align-${opt.value}`}>{opt.label}</Label>
              </div>
            )}
          </For>
        </div>
      </section>

      <section class="space-y-3 border-t pt-4">
        <h2 class="text-base font-semibold">歌词字体</h2>
        <MusicPlayDetailLyricFontSizeField
          remValue={settings().playDetailLyricFontSize}
          unit={settings().playDetailLyricFontSizeUnit}
          onRemChange={(rem) => apply({ playDetailLyricFontSize: rem })}
          onUnitChange={(unit) =>
            apply({ playDetailLyricFontSizeUnit: unit as MusicFontSizeUnit })
          }
        />
      </section>

      <section class="space-y-3 border-t pt-4">
        <h2 class="text-base font-semibold">频谱可视化</h2>
        <Show when={settings().audioVisualizationEnabled}>
          <div class="space-y-1">
            <Label for="music-play-detail-visualizer-fps-input">频谱帧率 (fps)</Label>
            <MusicSettingsNumberInput
              id="music-play-detail-visualizer-fps-input"
              value={settings().playDetailAudioVisualizerFps}
              min={15}
              max={120}
              step={1}
              class="w-28"
              aria-label="频谱帧率"
              normalize={(n) => Math.round(n)}
              onCommit={(value) => apply({ playDetailAudioVisualizerFps: value })}
            />
            <p class="text-xs text-muted-foreground">
              播放详情页频谱绘制帧率，默认 60 fps（15–120）。需在「音频输出」中开启频谱可视化。
            </p>
          </div>
        </Show>
        <Show when={!settings().audioVisualizationEnabled}>
          <p class="text-xs text-muted-foreground">
            请先在「音频输出」设置中开启「在播放详情显示频谱可视化」。
          </p>
        </Show>
      </section>
    </div>
  );
};
