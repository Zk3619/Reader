import { createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';

export const MusicSettingsSearch: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-7 p-4 text-sm">
      <section class="space-y-4">
        <div>
          <h2 class="text-base font-semibold">搜索设置</h2>
          <p class="mt-1 text-xs text-muted-foreground">搜索提示与搜索行为。</p>
        </div>
        <div class="space-y-3">
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
              id="music-search-save-history-input"
              checked={settings().searchHistoryEnabled}
              onChange={(checked) => applySettings({ searchHistoryEnabled: checked })}
            />
            <Label for="music-search-save-history-input">显示历史搜索记录</Label>
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
              id="music-search-clear-input-on-leave"
              checked={settings().searchClearInputOnLeave}
              onChange={(checked) => applySettings({ searchClearInputOnLeave: checked })}
            />
            <Label for="music-search-clear-input-on-leave">离开搜索界面时清空搜索框</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-search-clear-results-on-leave"
              checked={settings().searchClearResultsOnLeave}
              onChange={(checked) => applySettings({ searchClearResultsOnLeave: checked })}
            />
            <Label for="music-search-clear-results-on-leave">离开搜索界面时清空搜索列表</Label>
          </div>
        </div>
      </section>
    </div>
  );
};
