/**
 * 播放详情页内精简设置（对齐 LX Mobile SettingPopup）
 * 使用自管 Portal 面板，避免受控 NumberField 回写循环，并确保压过独立展示层。
 */

import { For, Show, createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { Portal } from 'solid-js/web';
import { X } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '@/components/ui/slider';
import { MusicPlayDetailLyricFontSizeField } from '@/components/viewer/audio/music/settings/MusicPlayDetailLyricFontSizeField';
import {
  getMusicSettings,
  setMusicSettings,
  subscribeMusicSettings,
  type MusicLyricAlign,
  type MusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  PLAY_DETAIL_LYRIC_FONT_REM_MAX,
  PLAY_DETAIL_LYRIC_FONT_REM_MIN,
  type MusicFontSizeUnit,
} from '@/lib/media/audio/play-detail-lyric-font';
import type { useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';

const ALIGN_OPTIONS: { value: MusicLyricAlign; label: string }[] = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
];

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

  onMount(() => {
    const unsub = subscribeMusicSettings((next) => setLocal(next));
    onCleanup(unsub);
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-130 flex items-end justify-center sm:items-center">
          <button
            type="button"
            class="absolute inset-0 bg-background/70"
            aria-label="关闭设置"
            onClick={() => props.onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="music-play-detail-settings-title"
            class="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border bg-background shadow-lg sm:rounded-xl"
          >
            <div class="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div class="min-w-0 space-y-1">
                <h2 id="music-play-detail-settings-title" class="text-base font-semibold">
                  播放详情设置
                </h2>
                <p class="text-sm text-muted-foreground">
                  调整歌词、音量、倍速与页面展示选项。
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-8 w-8 shrink-0"
                aria-label="关闭"
                onClick={() => props.onOpenChange(false)}
              >
                <X class="h-4 w-4" />
              </Button>
            </div>

            <div class="space-y-5 overflow-y-auto px-5 py-4 text-sm">
              <section class="space-y-3">
                <h3 class="font-medium">展示</h3>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="detail-popup-standalone"
                    checked={settings().playDetailStandalone}
                    onChange={(checked) => patchIfChanged({ playDetailStandalone: checked })}
                  />
                  <Label for="detail-popup-standalone">独立展示（占满整个视口）</Label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="detail-popup-hide-header"
                    checked={settings().playDetailHideHeader}
                    onChange={(checked) => patchIfChanged({ playDetailHideHeader: checked })}
                  />
                  <Label for="detail-popup-hide-header">隐藏顶栏（按钮分布到内容顶部）</Label>
                </div>
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <Checkbox
                      id="detail-popup-desktop-side-drawer"
                      checked={settings().playDetailDesktopSidePaneDrawer}
                      onChange={(checked) =>
                        patchIfChanged({ playDetailDesktopSidePaneDrawer: checked })
                      }
                    />
                    <Label for="detail-popup-desktop-side-drawer">
                      桌面端评论与队列使用右侧抽屉
                    </Label>
                  </div>
                  <p class="pl-6 text-xs text-muted-foreground">
                    关闭时使用可拖动分隔线的内嵌面板。
                  </p>
                </div>
              </section>

              <section class="space-y-3 border-t pt-4">
                <h3 class="font-medium">歌词</h3>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="detail-popup-lyric-seek"
                    checked={settings().playDetailAllowLyricSeek}
                    onChange={(checked) =>
                      patchIfChanged({
                        playDetailAllowLyricSeek: checked,
                        ...(checked
                          ? {}
                          : { playDetailLyricSeekAutoPlayOnRelease: false }),
                      })
                    }
                  />
                  <Label for="detail-popup-lyric-seek">允许通过拖拽歌词调整播放进度</Label>
                </div>
                <div class="flex items-center gap-2 pl-6">
                  <Checkbox
                    id="detail-popup-lyric-seek-auto-release"
                    checked={settings().playDetailLyricSeekAutoPlayOnRelease}
                    disabled={!settings().playDetailAllowLyricSeek}
                    onChange={(checked) =>
                      patchIfChanged({ playDetailLyricSeekAutoPlayOnRelease: checked })
                    }
                  />
                  <Label for="detail-popup-lyric-seek-auto-release">松开后自动跳转播放</Label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="detail-popup-lyric-dblclick-seek"
                    checked={settings().playDetailLyricDoubleClickSeek}
                    onChange={(checked) =>
                      patchIfChanged({ playDetailLyricDoubleClickSeek: checked })
                    }
                  />
                  <Label for="detail-popup-lyric-dblclick-seek">双击歌词跳转到对应进度</Label>
                </div>
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="detail-popup-zoom-lyric"
                    checked={settings().playDetailZoomActiveLyric}
                    onChange={(checked) => patchIfChanged({ playDetailZoomActiveLyric: checked })}
                  />
                  <Label for="detail-popup-zoom-lyric">缩放当前正在播放的歌词</Label>
                </div>
                <Show when={settings().playDetailZoomActiveLyric}>
                  <div class="flex flex-wrap items-center gap-2 pl-1">
                    <span class="text-muted-foreground">缩放幅度</span>
                    <Slider
                      class="w-36"
                      minValue={100}
                      maxValue={160}
                      step={1}
                      value={[
                        Math.round((settings().playDetailZoomActiveScale ?? 1.28) * 100),
                      ]}
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
                  <div class="flex flex-wrap gap-1.5">
                    <For each={ALIGN_OPTIONS}>
                      {(option) => (
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            settings().playDetailLyricAlign === option.value
                              ? 'default'
                              : 'outline'
                          }
                          class="h-8"
                          onClick={() => patchIfChanged({ playDetailLyricAlign: option.value })}
                        >
                          {option.label}
                        </Button>
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

              <section class="space-y-3 border-t pt-4">
                <h3 class="font-medium">音量</h3>
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
                    id="detail-popup-muted"
                    checked={props.player.musicMuted()}
                    onChange={props.player.setMusicMuted}
                  />
                  <Label for="detail-popup-muted">静音</Label>
                </div>
              </section>

              <section class="space-y-3 border-t pt-4">
                <h3 class="font-medium">倍速</h3>
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
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};
