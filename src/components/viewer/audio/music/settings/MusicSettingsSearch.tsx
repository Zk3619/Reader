import { createSignal, type Component } from 'solid-js';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { BUILTIN_SOURCE_LABELS } from '@/lib/media/audio/online/source-router';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';

export const MusicSettingsSearch: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  return (
    <div class="space-y-4 p-4 text-sm">
      <div>
        <span class="text-muted-foreground">默认搜索源：</span>
        <select
          class="ml-2 rounded border px-2 py-1"
          value={settings().defaultSource}
          onChange={(e) => {
            setMusicSettings({ defaultSource: e.currentTarget.value as AudioTrackSource });
            setLocal(getMusicSettings());
          }}
        >
          {Object.entries(BUILTIN_SOURCE_LABELS).map(([id, label]) => (
            <option value={id}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <span class="text-muted-foreground">默认搜索类型：</span>
        <select
          class="ml-2 rounded border px-2 py-1"
          value={settings().defaultSearchTab}
          onChange={(e) => {
            setMusicSettings({
              defaultSearchTab: e.currentTarget.value as 'song' | 'playlist',
            });
            setLocal(getMusicSettings());
          }}
        >
          <option value="song">歌曲</option>
          <option value="playlist">歌单</option>
        </select>
      </div>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings().searchHistoryEnabled}
          onChange={(e) => {
            setMusicSettings({ searchHistoryEnabled: e.currentTarget.checked });
            setLocal(getMusicSettings());
          }}
        />
        保存搜索历史
      </label>
    </div>
  );
};
