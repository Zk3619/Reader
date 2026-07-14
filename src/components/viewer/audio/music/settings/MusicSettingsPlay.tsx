import { createMemo, createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
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
      <label class="flex items-center gap-2 text-sm">
        <Checkbox
          checked={settings().autoPlay}
          onChange={(checked) => applySettings({ autoPlay: checked })}
        />
        自动播放
      </label>
      <label class="flex items-center gap-2 text-sm">
        <Checkbox
          checked={settings().rememberProgress}
          onChange={(checked) => applySettings({ rememberProgress: checked })}
        />
        记忆播放进度
      </label>
      <label class="flex items-center gap-2 text-sm">
        <Checkbox
          checked={settings().autoSkipOnError !== false}
          onChange={(checked) => applySettings({ autoSkipOnError: checked })}
        />
        取链/解码失败时自动下一首（仅歌单 / 我的列表）
      </label>
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
      <label class="flex items-center gap-2 text-sm">
        <Checkbox
          checked={settings().showLyricTranslation !== false}
          onChange={(checked) => applySettings({ showLyricTranslation: checked })}
        />
        显示歌词翻译
      </label>
      <label class="flex items-center gap-2 text-sm">
        <Checkbox
          checked={settings().showLyricRoma !== false}
          onChange={(checked) => applySettings({ showLyricRoma: checked })}
        />
        显示罗马音
      </label>
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
      <fieldset class="space-y-2 text-sm">
        <legend class="text-muted-foreground">跨源兜底</legend>
        <label class="flex items-center gap-2">
          <Checkbox
            checked={settings().fallbackUrl}
            onChange={(checked) => applySettings({ fallbackUrl: checked })}
          />
          URL 失败换源
        </label>
        <label class="flex items-center gap-2">
          <Checkbox
            checked={settings().fallbackLyric}
            onChange={(checked) => applySettings({ fallbackLyric: checked })}
          />
          歌词换源
        </label>
        <label class="flex items-center gap-2">
          <Checkbox
            checked={settings().fallbackPic}
            onChange={(checked) => applySettings({ fallbackPic: checked })}
          />
          封面换源
        </label>
      </fieldset>
    </div>
  );
};
