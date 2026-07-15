import { createMemo, createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  NumberField,
  NumberFieldInput,
} from '@/components/ui/number-field';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { getMusicPlayConfig, setMusicPlayMode } from '@/lib/media/audio/music-play-config';
import { AudioPlayMode } from '@/lib/media/audio/types';
import { playModeLabel } from '@/lib/media/audio/music-play-config';
import {
  QUALITY_PREFERENCE_LABELS,
  listPlayQualityPreferenceOptions,
  setPlayQuality,
  type MusicQualityPreference,
} from '@/lib/media/audio/music-quality';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  getDefaultUserApiId,
  subscribeUserApiScripts,
} from '@/lib/media/audio/online/user-api-engine';
import { onCleanup, onMount } from 'solid-js';
import { MusicSettingsAudioOutput } from '@/components/viewer/audio/music/settings/MusicSettingsAudioOutput';
import {
  getMusicOfflineMode,
  setMusicOfflineMode,
} from '@/lib/media/audio/online/user-api-settings';

const PLAY_MODES = [
  AudioPlayMode.listLoop,
  AudioPlayMode.singleLoop,
  AudioPlayMode.random,
  AudioPlayMode.listEndStop,
] as const;

const URL_SOURCE_MODES = ['auto', 'userApi', 'builtin'] as const;
const URL_SOURCE_LABELS: Record<(typeof URL_SOURCE_MODES)[number], string> = {
  userApi: '仅 UserApi',
  auto: '音源×平台 → 内置',
  builtin: '仅内置源',
};
const URL_SOURCE_HINTS: Record<(typeof URL_SOURCE_MODES)[number], string> = {
  userApi:
    '一个音源含多平台：先活跃音源穷尽原平台+换平台，再其它启用音源；不含内置试听。',
  auto: '同上 UserApi 音源×平台矩阵后，再走内置跨平台（推荐）。',
  builtin: '完全跳过自定义音源。',
};

const LYRIC_TRACKS = ['lyric', 'tlyric', 'rlyric', 'lxlyric'] as const;
const LYRIC_TRACK_LABELS: Record<(typeof LYRIC_TRACKS)[number], string> = {
  lyric: '原文',
  tlyric: '翻译',
  rlyric: '罗马音',
  lxlyric: '逐字',
};
const PLAY_SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2', '3'] as const;

export const MusicSettingsPlay: Component = () => {
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
          使用卡拉 OK 式歌词播放（如果可用）
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
      <section class="space-y-4 border-t pt-4">
        <div>
          <h2 class="text-base font-semibold">Reader 扩展 · 播放控制</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            倍速、进度拖动与默认播放模式是 Reader 扩展能力。
          </p>
        </div>
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
      <section class="space-y-4 border-t pt-4">
        <div>
          <h2 class="text-base font-semibold">Reader 扩展 · 取流策略</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            此区域用于 Reader 的多源取链与内置接口兜底，不属于 LX Music 播放设置原项。
          </p>
        </div>
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">取流策略：</span>
          <MusicAppSelect
            value={settings().urlSourceMode}
            onChange={(v) =>
              applySettings({ urlSourceMode: v as 'builtin' | 'userApi' | 'auto' })
            }
            options={URL_SOURCE_MODES}
            optionLabel={(v) => URL_SOURCE_LABELS[v]}
            triggerClass="w-52"
            aria-label="取流策略"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          {URL_SOURCE_HINTS[settings().urlSourceMode]}
        </p>
      </div>
      </section>
      <section class="space-y-4 border-t pt-4">
        <h2 class="text-base font-semibold">Reader 扩展 · 默认歌词轨</h2>
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
        <h2 class="text-base font-semibold">Reader 扩展 · 歌词转换</h2>
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
      <section class="space-y-4 border-t pt-4">
        <div>
          <h2 class="text-base font-semibold">Reader 扩展 · 歌词时间与播放保护</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            歌词偏移、定时停止、离线播放与跨源兜底为 Reader 扩展能力。
          </p>
        </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">歌词偏移（秒）：</span>
        <NumberField
          rawValue={settings().lyricOffset}
          onRawValueChange={(v) => applySettings({ lyricOffset: v })}
        >
          <NumberFieldInput class="w-20" aria-label="歌词偏移" />
        </NumberField>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">定时停止（秒，0=关闭）：</span>
        <NumberField
          rawValue={settings().playTimeoutSec ?? 0}
          onRawValueChange={(v) => applySettings({ playTimeoutSec: v })}
          minValue={0}
        >
          <NumberFieldInput class="w-20" aria-label="播放超时" />
        </NumberField>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-timeout-wait-track-end-input"
          checked={settings().playTimeoutWaitForTrackEnd}
          disabled={(settings().playTimeoutSec ?? 0) <= 0}
          onChange={(checked) =>
            applySettings({ playTimeoutWaitForTrackEnd: checked })
          }
        />
        <Label for="music-play-timeout-wait-track-end-input">
          定时结束后等待当前歌曲播放完成
        </Label>
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
          仅使用当前已启用且初始化成功的自定义源；内置接口是否参与由上方取流策略决定。
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
      </fieldset>
      </section>
      <section class="border-t pt-4">
        <MusicSettingsAudioOutput embedded />
      </section>
    </div>
  );
};
