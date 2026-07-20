import { createSignal, type Component } from 'solid-js';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { MusicAppSelect } from '@/components/media/viewer/audio/music/MusicAppSelect';

export const MusicSettingsList: Component = () => {
  const [settings, setLocal] = createSignal(getMusicSettings());

  const applySettings = (patch: Parameters<typeof setMusicSettings>[0]) => {
    setMusicSettings(patch);
    setLocal(getMusicSettings());
  };

  return (
    <div class="space-y-7 p-4 text-sm">
      <section class="space-y-4">
        <div>
          <h2 class="text-base font-semibold">列表设置</h2>
          <p class="mt-1 text-xs text-muted-foreground">歌曲列表的显示与播放行为。</p>
        </div>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-show-actions-input"
              checked={settings().listActionButtonsVisible}
              onChange={(checked) => applySettings({ listActionButtonsVisible: checked })}
            />
            <Label for="music-list-show-actions-input">显示列表操作按钮</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-show-source-input"
              checked={settings().listShowSource}
              onChange={(checked) => applySettings({ listShowSource: checked })}
            />
            <Label for="music-list-show-source-input">
              显示歌曲来源平台（仅对「我的列表」有效）
            </Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-save-scroll-position-input"
              checked={settings().listSaveScrollPosition}
              onChange={(checked) => applySettings({ listSaveScrollPosition: checked })}
            />
            <Label for="music-list-save-scroll-position-input">
              记住播放列表滚动条位置（仅对「我的列表」有效）
            </Label>
          </div>
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <Checkbox
                id="music-list-double-click-play-input"
                checked={settings().listDoubleClickToPlay}
                onChange={(checked) => applySettings({ listDoubleClickToPlay: checked })}
              />
              <Label for="music-list-double-click-play-input">
                桌面端双击列表歌曲才播放（对「歌单」「排行榜」「我的列表」均有效；移动端始终单击。搜索结果开启后会以临时队列播放整页，关闭则加入「播放列表」）
              </Label>
            </div>
            <p class="pl-6 text-xs text-muted-foreground">
              「播放列表」承接搜索/单曲加入并播放；真正切歌依据仍是播放队列。在线歌单/排行榜整表播放使用临时队列，不会覆盖播放列表。
            </p>
          </div>
        </div>
        <div class="space-y-2 pt-1">
          <h3 class="font-medium">添加歌曲到列表时的位置</h3>
          <div class="flex flex-wrap items-center gap-2">
            <MusicAppSelect
              value={settings().listAddPosition}
              onChange={(value) => applySettings({ listAddPosition: value as 'top' | 'bottom' })}
              options={['top', 'bottom'] as const}
              optionLabel={(value) => (value === 'top' ? '顶部' : '底部')}
              triggerClass="w-24"
              aria-label="添加歌曲到列表时的位置"
            />
          </div>
        </div>
      </section>

      <section class="space-y-5 border-t pt-5">
        <div class="space-y-3">
          <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">列显示与交互</h4>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-show-album-input"
              checked={settings().listShowAlbum}
              onChange={(checked) => applySettings({ listShowAlbum: checked })}
            />
            <Label for="music-list-show-album-input">显示专辑名</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-show-duration-input"
              checked={settings().listShowDuration}
              onChange={(checked) => applySettings({ listShowDuration: checked })}
            />
            <Label for="music-list-show-duration-input">显示歌曲时长</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-drag-sort-input"
              checked={settings().musicListDragSortEnabled !== false}
              onChange={(checked) => applySettings({ musicListDragSortEnabled: checked })}
            />
            <Label for="music-list-drag-sort-input">允许拖拽调整歌曲顺序</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox
              id="music-list-clear-queue-input"
              checked={settings().listClearQueueOnSwitch}
              onChange={(checked) => applySettings({ listClearQueueOnSwitch: checked })}
            />
            <Label for="music-list-clear-queue-input">切换列表时清空当前播放队列</Label>
          </div>
        </div>
      </section>
    </div>
  );
};
