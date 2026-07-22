import { createMemo, createSignal, Show, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  getMusicSettings,
  setMusicSettings,
} from '@/lib/media/audio/music-settings';
import {
  MUSIC_PLAY_TIMER_ACTION_LABELS,
  MUSIC_PLAY_TIMER_ACTIONS,
} from '@/lib/media/audio/music-play-timer';
import { getMusicPlayConfig, setMusicPlayMode } from '@/lib/media/audio/music-play-config';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { playModeLabel } from '@/lib/media/audio/music-play-config';
import { MusicSettingsNumberInput } from '@/components/media/viewer/audio/music/settings/MusicSettingsNumberInput';
import {
  QUALITY_PREFERENCE_LABELS,
  listPlayQualityPreferenceOptions,
  setPlayQuality,
  type MusicQualityPreference,
} from '@/lib/media/audio/music-quality';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';
import {
  getDefaultUserApiId,
  subscribeUserApiScripts,
} from '@/lib/media/audio/online/user-api-engine';
import { onCleanup, onMount } from 'solid-js';
import { MusicSettingsAudioOutput } from '@/components/media/viewer/audio/music/settings/MusicSettingsAudioOutput';
import type { MusicPlayBarProgressStyle } from '@/lib/media/audio/music-settings';
import {
  getMusicOfflineMode,
  setMusicOfflineMode,
} from '@/lib/media/audio/online/user-api-settings';
import { isAndroid, isMobile, isTauri } from '@/lib/platform/detect';
import { SettingItemAnchor } from '@/pages/settings/SettingItemAnchor';

const PLAY_MODES = [
  AudioPlayMode.listLoop,
  AudioPlayMode.singleLoop,
  AudioPlayMode.random,
  AudioPlayMode.listEndStop,
  AudioPlayMode.none,
] as const;

const LYRIC_TRACKS = ['lyric', 'tlyric', 'rlyric', 'lxlyric'] as const;
const LYRIC_TRACK_LABELS: Record<(typeof LYRIC_TRACKS)[number], string> = {
  lyric: '原文',
  tlyric: '翻译',
  rlyric: '罗马音',
  lxlyric: '逐字',
};
const PLAY_SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2', '3'] as const;
const PLAY_BAR_PROGRESS_STYLES = ['mini', 'middle', 'full'] as const;
const PLAY_BAR_PROGRESS_STYLE_LABELS: Record<MusicPlayBarProgressStyle, string> = {
  mini: '迷你',
  middle: '中等',
  full: '全宽',
};

export interface MusicSettingsPlayProps {
  highlightedItemId?: string | null;
}

export const MusicSettingsPlay: Component<MusicSettingsPlayProps> = (props) => {
  const highlight = (id: string) => props.highlightedItemId === id;
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [offlineOnly, setOfflineOnly] = createSignal(getMusicOfflineMode());
  const [apiRev, setApiRev] = createSignal(0);
  const playCfg = () => getMusicPlayConfig();
  const qualityOptions = createMemo(() => {
    apiRev();
    getDefaultUserApiId();
    return listPlayQualityPreferenceOptions();
  });

  onMount(() => {
    const unsub = subscribeUserApiScripts(() => setApiRev((v) => v + 1));
    onCleanup(unsub);
  });

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-4 p-4">
      <div>
        <h2 class="text-base font-semibold">播放设置</h2>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-auto-play-input"
          checked={settings().startupAutoPlay}
          onChange={(checked) => applySettings({ startupAutoPlay: checked })}
        />
        <Label for="music-play-auto-play-input">启动软件后自动播放音乐</Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-prevent-sleep-input"
          checked={settings().preventSleepWhilePlaying}
          onChange={(checked) => applySettings({ preventSleepWhilePlaying: checked })}
        />
        <Label for="music-play-prevent-sleep-input">播放歌曲时阻止电脑休眠</Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-remember-progress-input"
          checked={settings().rememberProgress}
          onChange={(checked) => applySettings({ rememberProgress: checked })}
        />
        <Label for="music-play-remember-progress-input">记住播放进度</Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-clean-played-list-input"
          checked={settings().autoCleanPlayedList}
          onChange={(checked) => applySettings({ autoCleanPlayedList: checked })}
        />
        <Label for="music-play-clean-played-list-input">
          点击与播放列表相同的列表切歌时清空已播放列表
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-show-lyric-translation-input"
          checked={settings().showLyricTranslation !== false}
          onChange={(checked) => applySettings({ showLyricTranslation: checked })}
        />
        <Label for="music-play-show-lyric-translation-input">
          显示歌词翻译（如果可用）
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-show-lyric-roma-input"
          checked={settings().showLyricRoma !== false}
          onChange={(checked) => applySettings({ showLyricRoma: checked })}
        />
        <Label for="music-play-show-lyric-roma-input">
          显示歌词罗马音（如果可用）
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-swap-lyric-order-input"
          checked={settings().lyricSecondaryOrder === 'roma-first'}
          onChange={(checked) =>
            applySettings({
              lyricSecondaryOrder: checked ? 'roma-first' : 'translation-first',
            })
          }
        />
        <Label for="music-play-swap-lyric-order-input">
          调换歌词翻译与歌词罗马音位置
        </Label>
      </div>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2 text-sm">
          <Checkbox
            id="music-play-auto-skip-error-input"
            checked={settings().autoSkipOnError !== false}
            onChange={(checked) => applySettings({ autoSkipOnError: checked })}
          />
          <Label for="music-play-auto-skip-error-input">
            播放错误时自动切换歌曲
          </Label>
        </div>
        <p class="pl-6 text-xs text-muted-foreground">
          仅在以列表方式播放（「我的列表」指针队列、「歌单/排行榜」临时队列，且多于一首）时生效；单曲加入播放列表后的短队列也会跳过。
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-lyric-s2t-input"
          checked={settings().lyricChineseConversion === 2}
          onChange={(checked) =>
            applySettings({ lyricChineseConversion: checked ? 2 : 0 })
          }
        />
        <Label for="music-play-lyric-s2t-input">
          将播放与下载歌曲歌词转换为繁体
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-word-by-word-lyric-input"
          checked={settings().lyricUseLxLyric}
          onChange={(checked) => applySettings({ lyricUseLxLyric: checked })}
        />
        <Label for="music-play-word-by-word-lyric-input">
          使用卡拉 OK 式歌词播放（有逐字轨时用逐字；否则按句时长均分每个字）
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-taskbar-progress-input"
          checked={settings().showTaskbarProgress}
          onChange={(checked) => applySettings({ showTaskbarProgress: checked })}
        />
        <Label for="music-play-taskbar-progress-input">
          在任务栏上显示当前歌曲播放进度
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-max-output-channels-input"
          checked={settings().audioUseMaxChannels}
          onChange={(checked) =>
            applySettings({
              audioUseMaxChannels: checked,
              ...(checked ? { audioOutputDeviceId: '' } : {}),
            })
          }
        />
        <Label for="music-play-max-output-channels-input">
          使用设备能处理的最大声道数输出音频
        </Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-pause-device-removed-input"
          checked={settings().audioPauseOnDeviceRemoved}
          onChange={(checked) => applySettings({ audioPauseOnDeviceRemoved: checked })}
        />
        <Label for="music-play-pause-device-removed-input">
          当前的声音输出设备被改变时暂停播放歌曲
        </Label>
      </div>
      <p class="text-xs text-muted-foreground">
        防休眠与任务栏进度仅在支持的平台生效；浏览器/WebView
        不支持的能力会自动降级。输出设备变化指已选设备被移除或不可用。
      </p>
      <SettingItemAnchor id="play-controls" highlighted={highlight('play-controls')}>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">播放控制</h2>
        <div class="flex items-center gap-2 text-sm">
          <Checkbox
            id="music-play-selection-auto-play-input"
            checked={settings().autoPlay}
            onChange={(checked) => applySettings({ autoPlay: checked })}
          />
          <Label for="music-play-selection-auto-play-input">
            选中歌曲或自动切歌后开始播放
          </Label>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">默认播放倍速：</span>
          <MusicAppSelect
            value={String(settings().playSpeed)}
            onChange={(value) => {
              const playSpeed = Number(value);
              applySettings({ playSpeed });
              const audio = document.querySelector<HTMLAudioElement>(
                'audio[data-music-hub-player]',
              );
              if (audio) audio.playbackRate = playSpeed;
            }}
            options={PLAY_SPEEDS}
            optionLabel={(value) => `${value}x`}
            triggerClass="w-24"
            aria-label="默认播放倍速"
          />
        </div>
        <div class="flex items-center gap-2 text-sm">
          <Checkbox
            id="music-play-preserve-pitch-input"
            checked={settings().preservesPitch}
            onChange={(checked) => {
              applySettings({ preservesPitch: checked });
              const audio = document.querySelector<HTMLAudioElement>(
                'audio[data-music-hub-player]',
              );
              if (audio) audio.preservesPitch = checked;
            }}
          />
          <Label for="music-play-preserve-pitch-input">倍速播放时保持音高</Label>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <Checkbox
            id="music-play-allow-progress-seek-input"
            checked={settings().allowProgressBarSeek}
            onChange={(checked) => applySettings({ allowProgressBarSeek: checked })}
          />
          <Label for="music-play-allow-progress-seek-input">允许拖动播放进度条</Label>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">播放栏进度条样式：</span>
          <MusicAppSelect
            value={settings().playBarProgressStyle}
            onChange={(value) =>
              applySettings({
                playBarProgressStyle: value as MusicPlayBarProgressStyle,
              })
            }
            options={PLAY_BAR_PROGRESS_STYLES}
            optionLabel={(value) => PLAY_BAR_PROGRESS_STYLE_LABELS[value]}
            triggerClass="w-28"
            aria-label="播放栏进度条样式"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">默认播放模式：</span>
          <MusicAppSelect
            value={String(playCfg().playMode)}
            onChange={(v) => setMusicPlayMode(Number(v) as AudioPlayMode)}
            options={PLAY_MODES.map(String)}
            optionLabel={(v) => playModeLabel(Number(v) as AudioPlayMode)}
            triggerClass="w-40"
            aria-label="默认播放模式"
          />
        </div>
      </section>
      </SettingItemAnchor>
      <SettingItemAnchor id="play-quality" highlighted={highlight('play-quality')}>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">优先播放的音质（如果可用）</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          最低/最高音质优先会按当前活跃自定义源支持的音质动态解析；固定音质仍受其能力限制。
        </p>
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted-foreground">播放音质：</span>
            <MusicAppSelect
              value={settings().playQualityPreference}
              onChange={(v) => {
                setPlayQuality(v as MusicQualityPreference);
                setLocal(getMusicSettings());
              }}
              options={qualityOptions()}
              optionLabel={(v) => QUALITY_PREFERENCE_LABELS[v]}
              triggerClass="w-36"
              aria-label="播放音质"
            />
          </div>
        </div>
      </section>
      </SettingItemAnchor>
      <SettingItemAnchor id="play-url-source-mode" highlighted={highlight('play-url-source-mode')}>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">取流策略</h2>
        <p class="text-sm text-muted-foreground">
          对齐 LX：内置五源仅提供搜索/歌单等数据，不提供在线播放与下载取链。在线取流仅通过「音源与账号」中的
          LX 自定义源（UserApi）或 MusicFree 插件。
        </p>
        <p class="text-xs text-muted-foreground">
          未导入并启用取链源时，在线曲将无法播放（本地文件 / 已缓存曲目不受影响）。
        </p>
      </section>
      </SettingItemAnchor>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">默认歌词轨</h2>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">默认歌词轨：</span>
          <MusicAppSelect
            value={settings().lyricTrack}
            onChange={(v) => applySettings({ lyricTrack: v as LyricTrackKind })}
            options={LYRIC_TRACKS}
            optionLabel={(v) => LYRIC_TRACK_LABELS[v]}
            triggerClass="w-28"
            aria-label="默认歌词轨"
          />
        </div>
      </section>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">歌词转换</h2>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">中文歌词转换：</span>
          <MusicAppSelect
            value={String(settings().lyricChineseConversion)}
            onChange={(value) =>
              applySettings({ lyricChineseConversion: Number(value) as 0 | 1 | 2 })
            }
            options={['0', '1', '2'] as const}
            optionLabel={(value) =>
              value === '1' ? '繁体转简体' : value === '2' ? '简体转繁体' : '关闭'
            }
            triggerClass="w-32"
            aria-label="歌词简繁转换"
          />
        </div>
      </section>
      <SettingItemAnchor id="play-timer-fallback" highlighted={highlight('play-timer-fallback')}>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">歌词时间与播放保护</h2>
        <div class="space-y-1 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">歌词偏移（秒）：</span>
            <MusicSettingsNumberInput
              value={settings().lyricOffset}
              step={0.1}
              aria-label="歌词偏移"
              onCommit={(v) => applySettings({ lyricOffset: v })}
            />
          </div>
          <p class="text-xs text-muted-foreground">
            全局默认偏移；播放详情可另设本曲偏移
          </p>
        </div>
        <Show when={isAndroid()}>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-bluetooth-lyric-input"
                checked={settings().bluetoothLyricEnabled}
                onChange={(checked) =>
                  applySettings({ bluetoothLyricEnabled: checked })
                }
              />
              <Label for="music-bluetooth-lyric-input">蓝牙/车机歌词（通知栏）</Label>
            </div>
            <p class="text-xs text-muted-foreground">
              开启后将当前歌词行写入 Android 通知元数据，便于部分车机/蓝牙设备显示。
            </p>
            <Show when={isTauri()}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void import('@tauri-apps/api/core').then(({ invoke }) =>
                    invoke('request_android_ignore_battery_optimizations').catch(
                      () => undefined,
                    ),
                  );
                }}
              >
                打开电池优化设置
              </Button>
            </Show>
          </div>
        </Show>
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">默认定时时长（分钟，0=关闭）：</span>
            <MusicSettingsNumberInput
              value={Math.round((settings().playTimeoutSec ?? 0) / 60)}
              min={0}
              step={1}
              aria-label="默认定时时长分钟"
              normalize={(n) => Math.round(n)}
              onCommit={(v) =>
                applySettings({
                  playTimeoutSec: Math.max(0, v) * 60,
                  playTimerTargetAt:
                    settings().playTimerTargetAt > Date.now()
                      ? Date.now() + Math.max(0, v) * 60_000
                      : settings().playTimerTargetAt,
                })
              }
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">定时结束后行为：</span>
            <MusicAppSelect
              value={settings().playTimerAction}
              onChange={(value) =>
                applySettings({
                  playTimerAction: value,
                  playTimeoutWaitForTrackEnd: value !== 'pause',
                })
              }
              options={[...MUSIC_PLAY_TIMER_ACTIONS]}
              optionLabel={(value) => MUSIC_PLAY_TIMER_ACTION_LABELS[value]}
              triggerClass="w-56"
              aria-label="定时结束后行为"
            />
          </div>
          <p class="text-xs text-muted-foreground">
            详情页可按持续时长或指定日期时间启用定时。“暂停播放”立即执行，其余行为会等待当前歌曲播放完毕。
          </p>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <Checkbox
            id="music-play-offline-only-input"
            checked={offlineOnly()}
            onChange={(checked) => {
              setOfflineOnly(checked);
              setMusicOfflineMode(checked);
            }}
          />
          <Label for="music-play-offline-only-input">仅播放已缓存曲目</Label>
        </div>
        <p class="text-xs text-muted-foreground">
          启用后不会请求在线音乐链接；未命中本地音频缓存时直接停止取链。
        </p>
        <fieldset class="space-y-2 text-sm">
          <legend class="text-muted-foreground">跨源兜底</legend>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-fallback-url-input"
              checked={settings().fallbackUrl}
              onChange={(checked) => applySettings({ fallbackUrl: checked })}
            />
            <Label for="music-play-fallback-url-input">
              多源兜底（主源失败时自动换源）
            </Label>
          </div>
          <p class="text-xs text-muted-foreground">
            仅使用当前已启用且初始化成功的自定义源 / MusicFree。
          </p>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-findmusic-score-input"
              checked={settings().findMusicScoredMatch !== false}
              onChange={(checked) => applySettings({ findMusicScoredMatch: checked })}
            />
            <Label for="music-play-findmusic-score-input">
              跨源匹配多级打分排序
            </Label>
          </div>
          <p class="text-xs text-muted-foreground">
            开启后 findMusic / 换源候选按歌名·歌手·时长·专辑打分排序（内置源与 UserApi/MusicFree
            换源路径共用）。关闭则回退为各源固定过滤规则、按音源顺序返回。
          </p>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-fallback-lyric-input"
              checked={settings().fallbackLyric}
              onChange={(checked) => applySettings({ fallbackLyric: checked })}
            />
            <Label for="music-play-fallback-lyric-input">歌词换源</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-fallback-cover-input"
              checked={settings().fallbackPic}
              onChange={(checked) => applySettings({ fallbackPic: checked })}
            />
            <Label for="music-play-fallback-cover-input">封面换源</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-auto-match-local"
              checked={settings().autoMatchLocalOnline}
              onChange={(checked) => applySettings({ autoMatchLocalOnline: checked })}
            />
            <Label for="music-play-auto-match-local">本地曲自动在线匹配</Label>
          </div>
          <p class="text-xs text-muted-foreground">
            播放本地文件时自动 findMusic 补封面，并挂载在线曲供歌词换源；音频仍走本地路径。
          </p>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-title-lyric"
              checked={settings().showTitleLyric}
              onChange={(checked) => applySettings({ showTitleLyric: checked })}
            />
            <Label for="music-play-title-lyric">标题栏显示歌词</Label>
          </div>
          <Show when={typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)}>
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-play-status-bar-lyric"
                checked={settings().showStatusBarLyric}
                onChange={(checked) => applySettings({ showStatusBarLyric: checked })}
              />
              <Label for="music-play-status-bar-lyric">macOS 状态栏歌词</Label>
            </div>
          </Show>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-play-crossfade"
              checked={settings().crossfadeEnabled}
              onChange={(checked) =>
                applySettings(
                  checked
                    ? {
                        crossfadeEnabled: true,
                        crossfadeMs:
                          settings().crossfadeMs > 0 ? settings().crossfadeMs : 1200,
                      }
                    : { crossfadeEnabled: false },
                )
              }
            />
            <Label for="music-play-crossfade">邻曲交叉淡入淡出</Label>
          </div>
          <Show when={settings().crossfadeEnabled}>
            <div class="flex items-center gap-2 pl-1">
              <Label for="music-play-crossfade-ms" class="shrink-0 text-muted-foreground">
                时长 (ms)
              </Label>
              <MusicSettingsNumberInput
                id="music-play-crossfade-ms"
                value={settings().crossfadeMs}
                min={0}
                max={5000}
                step={100}
                onCommit={(v) => applySettings({ crossfadeMs: v })}
              />
            </div>
          </Show>
          <p class="text-xs text-muted-foreground">
            非编解码级 gapless；短曲 / HLS 可能降级为硬切。关闭时仍可预载下一首以减少转圈。
          </p>
        </fieldset>
      </section>
      </SettingItemAnchor>
      <Show when={isTauri() && !isAndroid()}>
        <section class="space-y-3 border-t pt-4">
          <h3 class="text-sm font-medium">桌面迷你播放窗</h3>
          <p class="text-xs text-muted-foreground">
            独立置顶小窗，复用全局播放器胶囊样式；可在浏览其他页面时控制音乐。
          </p>
          <div class="flex items-center gap-2 text-sm">
            <Checkbox
              id="music-mini-mode-enabled"
              checked={settings().miniModeEnabled}
              onChange={(checked) => {
                applySettings({ miniModeEnabled: checked });
                void import('@/lib/media/audio/music-mini-player-window').then(
                  ({ setMiniModeEnabled }) => setMiniModeEnabled(checked),
                );
              }}
            />
            <Label for="music-mini-mode-enabled">启用迷你播放窗</Label>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Checkbox
              id="music-mini-mode-top"
              checked={settings().miniModeAlwaysOnTop}
              onChange={(checked) => applySettings({ miniModeAlwaysOnTop: checked })}
            />
            <Label for="music-mini-mode-top">窗口置顶</Label>
          </div>
        </section>
      </Show>
      <Show when={isMobile() || isAndroid()}>
        <section class="space-y-3 border-t pt-4">
          <h3 class="text-sm font-medium">移动网络</h3>
          <p class="text-xs text-muted-foreground">
            对齐 MusicFree：默认禁止在蜂窝网络下播放在线音源与下载，可手动放开；强制低音质与拦截正交。
          </p>
          <div class="flex items-center gap-2 text-sm">
            <Checkbox
              id="music-cellular-play"
              checked={settings().useCellularNetworkPlay}
              onChange={(checked) => applySettings({ useCellularNetworkPlay: checked })}
            />
            <Label for="music-cellular-play">使用移动网络播放</Label>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Checkbox
              id="music-cellular-download"
              checked={settings().useCellularNetworkDownload}
              onChange={(checked) => applySettings({ useCellularNetworkDownload: checked })}
            />
            <Label for="music-cellular-download">使用移动网络下载</Label>
          </div>
          <div class="flex items-center gap-2 text-sm">
            <Checkbox
              id="music-cellular-force-low"
              checked={settings().cellularForceLowestQuality !== false}
              onChange={(checked) => applySettings({ cellularForceLowestQuality: checked })}
            />
            <Label for="music-cellular-force-low">蜂窝网络强制低音质</Label>
          </div>
        </section>
      </Show>
      <section class="border-t pt-4">
        <MusicSettingsAudioOutput embedded />
      </section>
    </div>
  );
};
