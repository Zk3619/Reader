import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getMusicSettings, setMusicSettings } from '@/lib/media/audio/music-settings';
import { syncAllBoundLists } from '@/lib/media/audio/list/sync-source-list';
import { listAudioTracks, upsertAudioTracks } from '@/lib/database/audio-library';
import { matchLocalTrackOnline } from '@/lib/media/audio/library/local-online-match';
import { showAppToast } from '@/components/shared/AppToasts';

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
      <label class="flex items-center gap-2">
        <Checkbox
          checked={settings().syncAutoUpdateLists}
          onChange={(checked) => {
            setMusicSettings({ syncAutoUpdateLists: checked });
            setLocal(getMusicSettings());
          }}
        />
        自动更新源绑定列表
      </label>
      <Button size="sm" variant="outline" onClick={() => void syncAllBoundLists()}>
        立即同步全部绑定列表
      </Button>
      <Button size="sm" variant="outline" disabled={matching()} onClick={() => void batchMatchLocal()}>
        {matching() ? '匹配中…' : '批量本地曲在线匹配'}
      </Button>
    </div>
  );
};
