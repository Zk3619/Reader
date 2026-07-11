import { createSignal, type Component } from 'solid-js';
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
  setPlayQuality,
} from '@/lib/media/audio/music-quality';
import type { MusicQuality } from '@/lib/media/audio/lyric-types';
import type { LyricTrackKind } from '@/lib/media/audio/lyric-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';

const PLAY_MODES = [
  AudioPlayMode.listLoop,
  AudioPlayMode.singleLoop,
  AudioPlayMode.random,
  AudioPlayMode.listEndStop,
] as const;

const URL_SOURCE_MODES = ['auto', 'builtin', 'userApi'] as const;
const URL_SOURCE_LABELS: Record<(typeof URL_SOURCE_MODES)[number], string> = {
  auto: '自动（UserApi 优先）',
  builtin: '仅内置源',
  userApi: '仅 UserApi',
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
  const playCfg = () => getMusicPlayConfig();

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
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">播放音质：</span>
        <MusicAppSelect
          value={getPlayQuality()}
          onChange={(v) => {
            setPlayQuality(v as MusicQuality);
            setLocal(getMusicSettings());
          }}
          options={Object.keys(QUALITY_LABELS)}
          optionLabel={(v) => QUALITY_LABELS[v as MusicQuality]}
          triggerClass="w-32"
          aria-label="播放音质"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted-foreground">取流策略：</span>
        <MusicAppSelect
          value={settings().urlSourceMode}
          onChange={(v) =>
            applySettings({ urlSourceMode: v as 'builtin' | 'userApi' | 'auto' })
          }
          options={URL_SOURCE_MODES}
          optionLabel={(v) => URL_SOURCE_LABELS[v]}
          triggerClass="w-40"
          aria-label="取流策略"
        />
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
        <span class="text-muted-foreground">播放超时（秒，0=关闭）：</span>
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
