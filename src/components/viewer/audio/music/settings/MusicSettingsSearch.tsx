import { createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { BUILTIN_SOURCE_LABELS } from '@/lib/media/audio/online/source-router';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';

const SEARCH_TABS = ['song', 'playlist'] as const;
const SEARCH_TAB_LABELS: Record<(typeof SEARCH_TABS)[number], string> = {
  song: '歌曲',
  playlist: '歌单',
};

export const MusicSettingsSearch: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-4 p-4 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">默认搜索源：</span>
        <MusicAppSelect
          value={settings().defaultSource}
          onChange={(v) => applySettings({ defaultSource: v as AudioTrackSource })}
          options={Object.keys(BUILTIN_SOURCE_LABELS)}
          optionLabel={(v) => BUILTIN_SOURCE_LABELS[v as AudioTrackSource]}
          triggerClass="w-36"
          aria-label="默认搜索源"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">默认搜索类型：</span>
        <MusicAppSelect
          value={settings().defaultSearchTab}
          onChange={(v) =>
            applySettings({ defaultSearchTab: v as 'song' | 'playlist' })
          }
          options={SEARCH_TABS}
          optionLabel={(v) => SEARCH_TAB_LABELS[v]}
          triggerClass="w-28"
          aria-label="默认搜索类型"
        />
      </div>
      <label class="flex items-center gap-2">
        <Checkbox
          checked={settings().searchHistoryEnabled}
          onChange={(checked) => applySettings({ searchHistoryEnabled: checked })}
        />
        保存搜索历史
      </label>
    </div>
  );
};
