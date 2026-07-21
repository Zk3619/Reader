/**
 * 播放详情页内精简设置（对齐 LX Mobile SettingPopup）
 */

import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NumberField, NumberFieldInput } from '@/components/ui/number-field';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { AppDialogScrollBody } from '@/components/shared/AppDialog';
import { MusicPlayDetailLyricFontSizeField } from '@/components/media/viewer/audio/music/settings/MusicPlayDetailLyricFontSizeField';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogDescription,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicLyricAlign,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  getTrackLyricOffsetSec,
  musicLyricOffsetTrackKey,
  setTrackLyricOffsetSec,
  subscribeTrackLyricOffset,
} from '@/lib/media/audio/music-lyric-offset';
import {
  PLAY_DETAIL_LYRIC_FONT_REM_MAX,
  PLAY_DETAIL_LYRIC_FONT_REM_MIN,
  type MusicFontSizeUnit,
} from '@/lib/media/audio/play-detail-lyric-font';
import {
  appDialogSettingsScrollTrack,
  dialogScrollFrameFlex,
} from '@/lib/ui/viewport-classes';
import type { useMusicHubPlayer } from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';

const ALIGN_OPTIONS: { value: MusicLyricAlign; label: string }[] = [
  { value: 'left', label: '居左' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '居右' },
];

const sectionPanelClass =
  'rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3';

const sectionTitleClass = 'text-sm font-medium leading-none text-foreground';

export interface MusicPlayDetailSettingsPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: ReturnType<typeof useMusicHubPlayer>;
}

function patchIfChanged(patch: Partial<MusicSettings>): void {
  const current = getMusicSettings();
  const keys = Object.keys(patch) as (keyof MusicSettings)[];
  if (keys.every((key) => current[key] === patch[key])) return;
  setMusicSettings(patch);
}

export const MusicPlayDetailSettingsPopup: Component<MusicPlayDetailSettingsPopupProps> = (
  props,
) => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [trackOffsetRev, setTrackOffsetRev] = createSignal(0);

  onMount(() => {
    const unsub = subscribeMusicSettings((next) => setLocal(next));
    const unsubOffset = subscribeTrackLyricOffset(() => setTrackOffsetRev((n) => n + 1));
    onCleanup(() => {
      unsub();
      unsubOffset();
    });
  });

  const trackKey = createMemo(() => {
    const t = props.player.currentTrack();
    return t ? musicLyricOffsetTrackKey(String(t.source), t.id) : null;
  });
  const trackOffsetSec = createMemo(() => {
    trackOffsetRev();
    const key = trackKey();
    return key ? getTrackLyricOffsetSec(key) : 0;
  });

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <ViewerAppDialogContent layout="app" class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>播放详情设置</ViewerAppDialogTitle>
          <ViewerAppDialogDescription>
            调整歌词、音量、倍速与页面展示选项。
          </ViewerAppDialogDescription>
        </ViewerAppDialogHeader>

        <AppDialogScrollBody
          frameClass={dialogScrollFrameFlex}
          class={appDialogSettingsScrollTrack}
        >
          <section class={sectionPanelClass}>
            <h3 class={sectionTitleClass}>展示</h3>
            <div class="flex items-center gap-2">
              <Checkbox
                id="detail-popup-standalone-input"
                checked={settings().playDetailStandalone}
                onChange={(checked) => patchIfChanged({ playDetailStandalone: checked })}
              />
              <Label for="detail-popup-standalone-input">独立展示（占满整个视口）</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="detail-popup-hide-header-input"
                checked={settings().playDetailHideHeader}
                onChange={(checked) => patchIfChanged({ playDetailHideHeader: checked })}
              />
              <Label for="detail-popup-hide-header-input">隐藏顶栏（按钮分布到内容顶部）</Label>
            </div>
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <Checkbox
                  id="detail-popup-desktop-side-drawer-input"
                  checked={settings().playDetailDesktopSidePaneDrawer}
                  onChange={(checked) =>
                    patchIfChanged({ playDetailDesktopSidePaneDrawer: checked })
                  }
                />
                <Label for="detail-popup-desktop-side-drawer-input">
                  桌面端评论与队列使用右侧抽屉
                </Label>
              </div>
              <p class="pl-6 text-xs text-muted-foreground">
                关闭时使用可拖动分隔线的内嵌面板。
              </p>
            </div>
          </section>

          <section class={sectionPanelClass}>
            <h3 class={sectionTitleClass}>歌词</h3>
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-muted-foreground">本曲偏移</span>
                <NumberField
                  rawValue={trackOffsetSec()}
                  minValue={-30}
                  maxValue={30}
                  step={0.1}
                  disabled={!trackKey()}
                  onRawValueChange={(v) => {
                    const key = trackKey();
                    if (!key) return;
                    setTrackLyricOffsetSec(key, v);
                  }}
                >
                  <NumberFieldInput class="w-20" aria-label="本曲偏移" />
                </NumberField>
                <span class="text-muted-foreground">秒</span>
              </div>
              <p class="text-xs text-muted-foreground">
                设置页偏移为全局默认；此处仅作用于当前曲目，与全局叠加。
              </p>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="detail-popup-lyric-seek-input"
                checked={settings().playDetailAllowLyricSeek}
                onChange={(checked) =>
                  patchIfChanged({
                    playDetailAllowLyricSeek: checked,
                    ...(checked ? {} : { playDetailLyricSeekAutoPlayOnRelease: false }),
                  })
                }
              />
              <Label for="detail-popup-lyric-seek-input">允许通过拖拽歌词调整播放进度</Label>
            </div>
            <div class="flex items-center gap-2 pl-6">
              <Checkbox
                id="detail-popup-lyric-seek-auto-release-input"
                checked={settings().playDetailLyricSeekAutoPlayOnRelease}
                disabled={!settings().playDetailAllowLyricSeek}
                onChange={(checked) =>
                  patchIfChanged({ playDetailLyricSeekAutoPlayOnRelease: checked })
                }
              />
              <Label for="detail-popup-lyric-seek-auto-release-input">松开后自动跳转播放</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="detail-popup-lyric-dblclick-seek-input"
                checked={settings().playDetailLyricDoubleClickSeek}
                onChange={(checked) =>
                  patchIfChanged({ playDetailLyricDoubleClickSeek: checked })
                }
              />
              <Label for="detail-popup-lyric-dblclick-seek-input">双击歌词跳转到对应进度</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="detail-popup-zoom-lyric-input"
                checked={settings().playDetailZoomActiveLyric}
                onChange={(checked) => patchIfChanged({ playDetailZoomActiveLyric: checked })}
              />
              <Label for="detail-popup-zoom-lyric-input">缩放当前正在播放的歌词</Label>
            </div>
            <Show when={settings().playDetailZoomActiveLyric}>
              <div class="flex flex-wrap items-center gap-2 pl-1">
                <span class="text-muted-foreground">缩放幅度</span>
                <Slider
                  class="w-36"
                  minValue={100}
                  maxValue={160}
                  step={1}
                  value={[Math.round((settings().playDetailZoomActiveScale ?? 1.28) * 100)]}
                  onChange={(v) =>
                    patchIfChanged({
                      playDetailZoomActiveScale: (v[0] ?? 128) / 100,
                    })
                  }
                >
                  <SliderTrack>
                    <SliderFill />
                    <SliderThumb />
                  </SliderTrack>
                </Slider>
                <span class="tabular-nums text-xs">
                  {Math.round((settings().playDetailZoomActiveScale ?? 1.28) * 100)}%
                </span>
              </div>
            </Show>
            <div class="space-y-2">
              <span class="text-muted-foreground">对齐</span>
              <div class="flex flex-wrap gap-3">
                <For each={ALIGN_OPTIONS}>
                  {(option) => (
                    <div class="flex items-center gap-2">
                      <Checkbox
                        id={`music-play-detail-popup-align-${option.value}`}
                        checked={settings().playDetailLyricAlign === option.value}
                        onChange={(checked) => {
                          if (checked) patchIfChanged({ playDetailLyricAlign: option.value });
                        }}
                      />
                      <Label for={`music-play-detail-popup-align-${option.value}`}>
                        {option.label}
                      </Label>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <div class="space-y-2">
              <MusicPlayDetailLyricFontSizeField
                compact
                remValue={settings().playDetailLyricFontSize}
                unit={settings().playDetailLyricFontSizeUnit}
                onRemChange={(rem) => patchIfChanged({ playDetailLyricFontSize: rem })}
                onUnitChange={(unit) =>
                  patchIfChanged({
                    playDetailLyricFontSizeUnit: unit as MusicFontSizeUnit,
                  })
                }
              />
              <Slider
                minValue={PLAY_DETAIL_LYRIC_FONT_REM_MIN}
                maxValue={PLAY_DETAIL_LYRIC_FONT_REM_MAX}
                step={0.05}
                value={[settings().playDetailLyricFontSize]}
                onChange={(value) => {
                  const next = value[0] ?? PLAY_DETAIL_LYRIC_FONT_REM_MIN;
                  patchIfChanged({ playDetailLyricFontSize: next });
                }}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
            </div>
          </section>

          <section class={sectionPanelClass}>
            <h3 class={sectionTitleClass}>音量</h3>
            <div class="flex items-center gap-3">
              <Slider
                class="flex-1"
                minValue={0}
                maxValue={100}
                step={1}
                value={[Math.round(props.player.musicVolume() * 100)]}
                onChange={(value) => {
                  const next = (value[0] ?? 0) / 100;
                  props.player.setMusicVolume(next);
                  if (next > 0) props.player.setMusicMuted(false);
                }}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="w-12 text-right tabular-nums">
                {Math.round(props.player.musicVolume() * 100)}%
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="detail-popup-muted-input"
                checked={props.player.musicMuted()}
                onChange={props.player.setMusicMuted}
              />
              <Label for="detail-popup-muted-input">静音</Label>
            </div>
          </section>

          <section class={sectionPanelClass}>
            <h3 class={sectionTitleClass}>倍速</h3>
            <div class="flex items-center gap-3">
              <Slider
                class="flex-1"
                minValue={0.5}
                maxValue={3}
                step={0.05}
                value={[settings().playSpeed]}
                onChange={(value) => {
                  const speed = value[0] ?? 1;
                  if (speed === settings().playSpeed) return;
                  patchIfChanged({ playSpeed: speed });
                  props.player.player.setPlaybackRate(speed);
                }}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb />
                </SliderTrack>
              </Slider>
              <span class="w-14 text-right tabular-nums">
                {settings().playSpeed.toFixed(2)}x
              </span>
            </div>
          </section>
        </AppDialogScrollBody>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
};
