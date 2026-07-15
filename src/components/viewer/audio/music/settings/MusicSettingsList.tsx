import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { syncAllBoundLists } from '@/lib/media/audio/list/sync-source-list';
import { listAudioTracks, upsertAudioTracks } from '@/lib/database/audio-library';
import { matchLocalTrackOnline } from '@/lib/media/audio/library/local-online-match';
import { showAppToast } from '@/components/shared/AppToasts';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import {
  setMusicSongListPaginationPreference,
  setMusicSongListSortControl,
  setMusicSongListSourceControl,
  setMusicSongListTagControl,
} from '@/stores/music-hub/music-songlist-ui';
import { setMusicLeaderboardPaginationPreference } from '@/stores/music-hub/music-leaderboard-ui';

export const MusicSettingsList: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());
  const [matching, setMatching] = createSignal(false);

  const batchMatchLocal = async () => {
    setMatching(true);
    try {
      const locals = (await listAudioTracks('local')).slice(0, 50);
      let matched = 0;
      for (const t of locals) {
        const online = await matchLocalTrackOnline(t);
        if (online) {
          await upsertAudioTracks([
            {
              ...t,
              meta: { ...t.meta, matchedOnlineId: online.id, matchedSource: online.source },
            },
          ]);
          matched++;
        }
      }
      showAppToast({ title: `已匹配 ${matched}/${locals.length} 首本地曲`, variant: 'success' });
    } finally {
      setMatching(false);
    }
  };

  return (
    <div class="space-y-4 p-4 text-sm">
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-sync-auto-update-input"
          checked={settings().syncAutoUpdateLists}
          onChange={(checked) => {
            setMusicSettings({ syncAutoUpdateLists: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-sync-auto-update-input">自动更新源绑定列表</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-show-source-input"
          checked={settings().listShowSource}
          onChange={(checked) => {
            setMusicSettings({ listShowSource: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-show-source-input">显示歌曲来源</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-show-album-input"
          checked={settings().listShowAlbum}
          onChange={(checked) => {
            setMusicSettings({ listShowAlbum: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-show-album-input">显示专辑名</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-show-duration-input"
          checked={settings().listShowDuration}
          onChange={(checked) => {
            setMusicSettings({ listShowDuration: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-show-duration-input">显示歌曲时长</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-show-actions-input"
          checked={settings().listActionButtonsVisible}
          onChange={(checked) => {
            setMusicSettings({ listActionButtonsVisible: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-show-actions-input">始终显示歌曲操作按钮</Label>
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-save-scroll-position-input"
          checked={settings().listSaveScrollPosition}
          onChange={(checked) => {
            setMusicSettings({ listSaveScrollPosition: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-save-scroll-position-input">记住列表滚动位置</Label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">新增歌曲位置：</span>
        <MusicAppSelect
          value={settings().listAddPosition}
          onChange={(value) => {
            setMusicSettings({ listAddPosition: value as 'top' | 'bottom' });
            setLocal(getMusicSettings());
          }}
          options={['top', 'bottom'] as const}
          optionLabel={(value) => (value === 'top' ? '顶部' : '底部')}
          triggerClass="w-24"
          aria-label="新增歌曲位置"
        />
      </div>
      <div class="flex items-center gap-2">
        <Checkbox
          id="music-list-drag-sort-input"
          checked={settings().musicListDragSortEnabled !== false}
          onChange={(checked) => {
            setMusicSettings({ musicListDragSortEnabled: checked });
            setLocal(getMusicSettings());
          }}
        />
        <Label for="music-list-drag-sort-input">允许拖拽调整歌曲顺序</Label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">在线歌单来源：</span>
        <MusicAppSelect
          value={settings().musicSongListSourceControl ?? 'select'}
          onChange={(value) => {
            setMusicSongListSourceControl(value as 'select' | 'tabs');
            setLocal(getMusicSettings());
          }}
          options={['select', 'tabs'] as const}
          optionLabel={(value) => (value === 'select' ? '下拉选择' : '标签页')}
          triggerClass="w-28"
          aria-label="在线歌单来源样式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">在线歌单排序：</span>
        <MusicAppSelect
          value={settings().musicSongListSortControl ?? 'select'}
          onChange={(value) => {
            setMusicSongListSortControl(value as 'select' | 'tabs');
            setLocal(getMusicSettings());
          }}
          options={['select', 'tabs'] as const}
          optionLabel={(value) => (value === 'select' ? '下拉选择' : '标签页')}
          triggerClass="w-28"
          aria-label="在线歌单排序样式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">在线歌单标签：</span>
        <MusicAppSelect
          value={settings().musicSongListTagControl ?? 'grouped'}
          onChange={(value) => {
            setMusicSongListTagControl(value as 'grouped' | 'stacked');
            setLocal(getMusicSettings());
          }}
          options={['grouped', 'stacked'] as const}
          optionLabel={(value) => (value === 'grouped' ? '分组选择' : '徽标平铺')}
          triggerClass="w-28"
          aria-label="在线歌单标签样式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">在线歌单翻页：</span>
        <MusicAppSelect
          value={settings().musicSongListPaginationPreference ?? 'pagination'}
          onChange={(value) => {
            setMusicSongListPaginationPreference(value as 'scroll' | 'pagination');
            setLocal(getMusicSettings());
          }}
          options={['pagination', 'scroll'] as const}
          optionLabel={(value) => (value === 'pagination' ? '分页' : '滚动加载')}
          triggerClass="w-28"
          aria-label="在线歌单翻页方式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-muted-foreground">排行榜翻页：</span>
        <MusicAppSelect
          value={settings().musicLeaderboardPaginationPreference ?? 'pagination'}
          onChange={(value) => {
            setMusicLeaderboardPaginationPreference(value as 'scroll' | 'pagination');
            setLocal(getMusicSettings());
          }}
          options={['pagination', 'scroll'] as const}
          optionLabel={(value) => (value === 'pagination' ? '分页' : '滚动加载')}
          triggerClass="w-28"
          aria-label="排行榜翻页方式"
        />
      </div>
      <Button size="sm" variant="outline" onClick={() => void syncAllBoundLists()}>
        立即同步全部绑定列表
      </Button>
      <Button size="sm" variant="outline" disabled={matching()} onClick={() => void batchMatchLocal()}>
        {matching() ? '匹配中…' : '批量本地曲在线匹配'}
      </Button>
    </div>
  );
};
