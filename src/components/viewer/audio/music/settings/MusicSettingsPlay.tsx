import { createSignal, type Component } from 'solid-js';
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

export const MusicSettingsPlay: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const playCfg = () => getMusicPlayConfig();

  return (
    <div class="space-y-4 p-4">
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings().autoPlay}
          onChange={(e) => {
            setMusicSettings({ autoPlay: e.currentTarget.checked });
            setLocal(getMusicSettings());
          }}
        />
        自动播放
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings().rememberProgress}
          onChange={(e) => {
            setMusicSettings({ rememberProgress: e.currentTarget.checked });
            setLocal(getMusicSettings());
          }}
        />
        记忆播放进度
      </label>
      <div class="text-sm">
        <span class="text-muted-foreground">默认播放模式：</span>
        <select
          class="ml-2 rounded border px-2 py-1"
          value={playCfg().playMode}
          onChange={(e) => setMusicPlayMode(Number(e.currentTarget.value) as AudioPlayMode)}
        >
          {[
            AudioPlayMode.listLoop,
            AudioPlayMode.singleLoop,
            AudioPlayMode.random,
            AudioPlayMode.listEndStop,
          ].map((m) => (
            <option value={m}>{playModeLabel(m)}</option>
          ))}
        </select>
      </div>
      <div class="text-sm">
        <span class="text-muted-foreground">播放音质：</span>
        <select
          class="ml-2 rounded border px-2 py-1"
          value={getPlayQuality()}
          onChange={(e) => {
            setPlayQuality(e.currentTarget.value as MusicQuality);
            setLocal(getMusicSettings());
          }}
        >
          {Object.entries(QUALITY_LABELS).map(([k, label]) => (
            <option value={k}>{label}</option>
          ))}
        </select>
      </div>
      <div class="text-sm">
        <span class="text-muted-foreground">取流策略：</span>
        <select
          class="ml-2 rounded border px-2 py-1"
          value={settings().urlSourceMode}
          onChange={(e) => {
            setMusicSettings({
              urlSourceMode: e.currentTarget.value as 'builtin' | 'userApi' | 'auto',
            });
            setLocal(getMusicSettings());
          }}
        >
          <option value="auto">自动（内置优先）</option>
          <option value="builtin">仅内置源</option>
          <option value="userApi">仅 UserApi</option>
        </select>
      </div>
      <div class="text-sm">
        <span class="text-muted-foreground">默认歌词轨：</span>
        <select
          class="ml-2 rounded border px-2 py-1"
          value={settings().lyricTrack}
          onChange={(e) => {
            setMusicSettings({ lyricTrack: e.currentTarget.value as LyricTrackKind });
            setLocal(getMusicSettings());
          }}
        >
          <option value="lyric">原文</option>
          <option value="tlyric">翻译</option>
          <option value="rlyric">罗马音</option>
          <option value="lxlyric">逐字</option>
        </select>
      </div>
      <div class="text-sm">
        <span class="text-muted-foreground">歌词偏移（秒）：</span>
        <input
          type="number"
          class="ml-2 w-20 rounded border px-2 py-1"
          value={settings().lyricOffset}
          onChange={(e) => {
            setMusicSettings({ lyricOffset: Number(e.currentTarget.value) });
            setLocal(getMusicSettings());
          }}
        />
      </div>
      <div class="text-sm">
        <span class="text-muted-foreground">播放超时（秒，0=关闭）：</span>
        <input
          type="number"
          min={0}
          class="ml-2 w-20 rounded border px-2 py-1"
          value={settings().playTimeoutSec ?? 0}
          onChange={(e) => {
            setMusicSettings({ playTimeoutSec: Number(e.currentTarget.value) });
            setLocal(getMusicSettings());
          }}
        />
      </div>
      <fieldset class="space-y-2 text-sm">
        <legend class="text-muted-foreground">跨源兜底</legend>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings().fallbackUrl}
            onChange={(e) => {
              setMusicSettings({ fallbackUrl: e.currentTarget.checked });
              setLocal(getMusicSettings());
            }}
          />
          URL 失败换源
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings().fallbackLyric}
            onChange={(e) => {
              setMusicSettings({ fallbackLyric: e.currentTarget.checked });
              setLocal(getMusicSettings());
            }}
          />
          歌词换源
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings().fallbackPic}
            onChange={(e) => {
              setMusicSettings({ fallbackPic: e.currentTarget.checked });
              setLocal(getMusicSettings());
            }}
          />
          封面换源
        </label>
      </fieldset>
    </div>
  );
};
