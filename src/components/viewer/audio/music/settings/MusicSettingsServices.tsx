import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { showAppToast } from '@/components/shared/AppToasts';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { syncAllBoundLists } from '@/lib/media/audio/list/sync-source-list';
import { MusicSettingsOpenApi } from '@/components/viewer/audio/music/settings/MusicSettingsOpenApi';
import { MusicSettingsSync } from '@/components/viewer/audio/music/settings/MusicSettingsSync';

export const MusicSettingsServices: Component = () => {
  const [autoUpdateLists, setAutoUpdateLists] = createSignal(
    getMusicSettings().syncAutoUpdateLists,
  );
  const [syncingLists, setSyncingLists] = createSignal(false);

  const syncBoundLists = async () => {
    setSyncingLists(true);
    try {
      await syncAllBoundLists();
      showAppToast({ title: '绑定列表同步完成', variant: 'success' });
    } catch (error) {
      showAppToast({
        title: '绑定列表同步失败',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setSyncingLists(false);
    }
  };

  return (
    <div class="space-y-7 p-4 text-sm">
      <div>
        <h2 class="text-base font-semibold">服务与同步</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          管理数据同步、自动化接口和绑定列表更新。
        </p>
      </div>

      <section class="space-y-4">
        <div>
          <h3 class="font-medium">数据同步</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            在 Reader、LX Music 和远程快照之间同步音乐数据。
          </p>
        </div>
        <MusicSettingsSync embedded />
      </section>

      <section class="space-y-4 border-t pt-5">
        <div>
          <h3 class="font-medium">OpenAPI</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            允许自动化工具通过 HTTP 控制 Reader 音乐播放。
          </p>
        </div>
        <MusicSettingsOpenApi embedded />
      </section>

      <section class="space-y-3 border-t pt-5">
        <div>
          <h3 class="font-medium">绑定列表更新</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            自动或手动刷新与外部来源绑定的音乐列表。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="music-services-sync-auto-update-input"
            checked={autoUpdateLists()}
            onChange={(checked) => {
              setAutoUpdateLists(checked);
              setMusicSettings({ syncAutoUpdateLists: checked });
            }}
          />
          <Label for="music-services-sync-auto-update-input">自动更新源绑定列表</Label>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={syncingLists()}
          onClick={() => void syncBoundLists()}
        >
          {syncingLists() ? '同步中…' : '立即同步全部绑定列表'}
        </Button>
      </section>
    </div>
  );
};
