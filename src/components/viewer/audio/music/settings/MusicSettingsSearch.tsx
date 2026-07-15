import { createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { BUILTIN_SOURCE_LABELS } from '@/lib/media/audio/online/source-router';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  setMusicSearchPaginationPreference,
  setMusicSearchSourceControl,
  setMusicSearchTabControl,
} from '@/stores/music-hub/music-search-ui';

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
        <span class="text-muted-foreground">来源选择样式：</span>
        <MusicAppSelect
          value={settings().musicSearchSourceControl ?? 'select'}
          onChange={(value) => {
            setMusicSearchSourceControl(value as 'select' | 'tabs');
            setLocal(getMusicSettings());
          }}
          options={['select', 'tabs'] as const}
          optionLabel={(value) => (value === 'select' ? '下拉选择' : '标签页')}
          triggerClass="w-28"
          aria-label="搜索来源选择样式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">搜索类型样式：</span>
        <MusicAppSelect
          value={settings().musicSearchTabControl ?? 'select'}
          onChange={(value) => {
            setMusicSearchTabControl(value as 'select' | 'tabs');
            setLocal(getMusicSettings());
          }}
          options={['select', 'tabs'] as const}
          optionLabel={(value) => (value === 'select' ? '下拉选择' : '标签页')}
          triggerClass="w-28"
          aria-label="搜索类型选择样式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">结果翻页方式：</span>
        <MusicAppSelect
          value={settings().musicSearchPaginationPreference ?? 'pagination'}
          onChange={(value) => {
            setMusicSearchPaginationPreference(value as 'scroll' | 'pagination');
            setLocal(getMusicSettings());
          }}
          options={['pagination', 'scroll'] as const}
          optionLabel={(value) => (value === 'pagination' ? '分页' : '滚动加载')}
          triggerClass="w-28"
          aria-label="搜索结果翻页方式"
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
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-search-save-history-input"
          checked={settings().searchHistoryEnabled}
          onChange={(checked) => applySettings({ searchHistoryEnabled: checked })}
        />
        <Label for="music-search-save-history-input">保存搜索历史</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-search-show-hot-input"
          checked={settings().searchHotEnabled}
          onChange={(checked) => applySettings({ searchHotEnabled: checked })}
        />
        <Label for="music-search-show-hot-input">显示热门搜索</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-search-focus-on-enter-input"
          checked={settings().searchFocusOnEnter}
          onChange={(checked) => applySettings({ searchFocusOnEnter: checked })}
        />
        <Label for="music-search-focus-on-enter-input">进入搜索页时自动聚焦搜索框</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-search-clear-input-on-leave-input"
          checked={settings().searchClearInputOnLeave}
          onChange={(checked) => applySettings({ searchClearInputOnLeave: checked })}
        />
        <Label for="music-search-clear-input-on-leave-input">
          离开搜索页时清空关键词
        </Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-search-clear-results-on-leave-input"
          checked={settings().searchClearResultsOnLeave}
          onChange={(checked) => applySettings({ searchClearResultsOnLeave: checked })}
        />
        <Label for="music-search-clear-results-on-leave-input">
          离开搜索页时清空搜索结果
        </Label>
      </div>
    </div>
  );
};
