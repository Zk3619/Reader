import { createSignal, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { toUserFacingMusicError } from '@/lib/media/audio/music-user-error';
import { listAudioTracks, upsertAudioTracks } from '@/lib/database/audio-library';
import { enrichLocalTrackOnlineMeta } from '@/lib/media/audio/library/local-online-match';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { MusicSettingsBackup } from '@/components/media/viewer/audio/music/settings/MusicSettingsBackup';
import { MusicSettingsOther } from '@/components/media/viewer/audio/music/settings/MusicSettingsOther';

export const MusicSettingsDataMaintenance: Component = () => {
  const [matching, setMatching] = createSignal(false);
  const [progress, setProgress] = createSignal('');

  const batchMatchLocal = async () => {
    setMatching(true);
    setProgress('');
    try {
      const limit = getMusicSettings().localOnlineMatchBatchLimit || 200;
      const allLocal = await listAudioTracks('local');
      const localTracks = allLocal.slice(0, limit);
      let matched = 0;
      for (let i = 0; i < localTracks.length; i++) {
        const track = localTracks[i]!;
        setProgress(`${i + 1}/${localTracks.length}`);
        const enriched = await enrichLocalTrackOnlineMeta(track, { force: true });
        if (
          typeof enriched.meta.matchedOnlineId === 'string' &&
          enriched.meta.matchedOnlineId.trim()
        ) {
          await upsertAudioTracks([enriched]);
          matched += 1;
        }
      }
      showAppToast({
        title: `已匹配 ${matched}/${localTracks.length} 首本地曲`,
        description:
          allLocal.length > localTracks.length
            ? `本次上限 ${limit}（库内共 ${allLocal.length} 首）`
            : undefined,
        variant: 'success',
      });
    } catch (error) {
      showAppToast({
        title: '本地曲在线匹配失败',
        description: toUserFacingMusicError(error),
        variant: 'destructive',
      });
    } finally {
      setMatching(false);
      setProgress('');
    }
  };

  const batchLimit = () => getMusicSettings().localOnlineMatchBatchLimit || 200;

  return (
    <div class="space-y-7 p-4 text-sm">
      <div>
        <h2 class="text-base font-semibold">数据与维护</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          备份音乐数据，管理缓存与过滤规则，并维护本地曲信息。
        </p>
      </div>

      <section class="space-y-4">
        <div>
          <h3 class="font-medium">备份与恢复</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            导出或导入包含音乐设置、曲库和歌单的完整备份。
          </p>
        </div>
        <MusicSettingsBackup embedded />
      </section>

      <section class="space-y-4 border-t pt-5">
        <div>
          <h3 class="font-medium">缓存与不喜欢歌曲</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            查看缓存管理入口并维护不喜欢歌曲过滤规则。
          </p>
        </div>
        <MusicSettingsOther embedded />
      </section>

      <section class="space-y-3 border-t pt-5">
        <div>
          <h3 class="font-medium">本地曲在线匹配</h3>
          <p class="mt-1 text-xs text-muted-foreground">
            为最多 {batchLimit()} 首本地歌曲补充在线平台标识与封面，以改善歌词和元数据匹配。
            播放时也可按「本地曲自动在线匹配」逐首补全。
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={matching()}
          onClick={() => void batchMatchLocal()}
        >
          {matching()
            ? `匹配中… ${progress()}`
            : '批量本地曲在线匹配'}
        </Button>
      </section>
    </div>
  );
};
