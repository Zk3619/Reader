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
  QUALITY_LABELS,
  getPlayQuality,
  listPlayQualityOptions,
  setPlayQuality,
} from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  getDefaultUserApiId,
  subscribeUserApiScripts,
} from '@/lib/media/audio/online/user-api-engine';
import { onCleanup, onMount } from 'solid-js';
import { EQ_PRESETS } from '@/lib/media/audio/engine/web-audio-player';

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
const PLAY_SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '2'] as const;
const LYRIC_SECONDARY_ORDERS = ['translation-first', 'roma-first'] as const;

export const MusicSettingsPlay: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [apiRev, setApiRev] = createSignal(0);
  const playCfg = () => getMusicPlayConfig();
  const qualityOptions = createMemo(() => {
    apiRev();
    getDefaultUserApiId();
    return listPlayQualityOptions();
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
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-auto-play-input"
          checked={settings().autoPlay}
          onChange={(checked) => applySettings({ autoPlay: checked })}
        />
        <Label for="music-play-auto-play-input">自动播放</Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-remember-progress-input"
          checked={settings().rememberProgress}
          onChange={(checked) => applySettings({ rememberProgress: checked })}
        />
        <Label for="music-play-remember-progress-input">记忆播放进度</Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-auto-skip-error-input"
          checked={settings().autoSkipOnError !== false}
          onChange={(checked) => applySettings({ autoSkipOnError: checked })}
        />
        <Label for="music-play-auto-skip-error-input">
          取链/解码失败时自动下一首（仅歌单 / 我的列表）
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
        <span class="text-muted-foreground">均衡器预设：</span>
        <MusicAppSelect
          value={settings().eqPreset}
          onChange={(value) =>
            applySettings({ eqPreset: value as keyof typeof EQ_PRESETS })
          }
          options={Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[]}
          triggerClass="w-28"
          aria-label="均衡器预设"
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
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-muted-foreground">播放音质：</span>
          <MusicAppSelect
            value={
              qualityOptions().includes(getPlayQuality())
                ? getPlayQuality()
                : (qualityOptions()[0] ?? getPlayQuality())
            }
            onChange={(v) => {
              setPlayQuality(v as MusicQuality);
              setLocal(getMusicSettings());
            }}
            options={qualityOptions()}
            optionLabel={(v) => QUALITY_LABELS[v as MusicQuality] ?? v}
            triggerClass="w-32"
            aria-label="播放音质"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          列表受当前活跃自定义源 qualitys 限制（无登记时显示全部）。
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
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-show-lyric-translation-input"
          checked={settings().showLyricTranslation !== false}
          onChange={(checked) => applySettings({ showLyricTranslation: checked })}
        />
        <Label for="music-play-show-lyric-translation-input">显示歌词翻译</Label>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-show-lyric-roma-input"
          checked={settings().showLyricRoma !== false}
          onChange={(checked) => applySettings({ showLyricRoma: checked })}
        />
        <Label for="music-play-show-lyric-roma-input">显示罗马音</Label>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">副歌词优先显示：</span>
        <MusicAppSelect
          value={settings().lyricSecondaryOrder}
          onChange={(value) =>
            applySettings({
              lyricSecondaryOrder: value as 'translation-first' | 'roma-first',
            })
          }
          options={LYRIC_SECONDARY_ORDERS}
          optionLabel={(value) => (value === 'translation-first' ? '翻译' : '罗马音')}
          triggerClass="w-28"
          aria-label="副歌词优先顺序"
        />
      </div>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox
          id="music-play-word-by-word-lyric-input"
          checked={settings().lyricUseLxLyric}
          onChange={(checked) => applySettings({ lyricUseLxLyric: checked })}
        />
        <Label for="music-play-word-by-word-lyric-input">启用逐字歌词</Label>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">歌词简繁转换：</span>
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
      <fieldset class="space-y-2 text-sm">
        <legend class="text-muted-foreground">跨源兜底</legend>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-play-fallback-url-input"
            checked={settings().fallbackUrl}
            onChange={(checked) => applySettings({ fallbackUrl: checked })}
          />
          <Label for="music-play-fallback-url-input">URL 失败换源</Label>
        </div>
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
    </div>
  );
};
