import { createSignal, onMount, type Component } from 'solid-js';
import { AudioDislikePanel } from '@/components/media/viewer/audio/music/AudioDislikePanel';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { isTauri } from '@/lib/platform/detect';

export interface MusicSettingsOtherProps {
  embedded?: boolean;
}

export const MusicSettingsOther: Component<MusicSettingsOtherProps> = (props) => {
  const [clearingAuto, setClearingAuto] = createSignal(false);
  const [clearingLyric, setClearingLyric] = createSignal(false);
  const [clearingCover, setClearingCover] = createSignal(false);
  const [reconciling, setReconciling] = createSignal(false);
  const [lyricCount, setLyricCount] = createSignal(0);
  const [coverCount, setCoverCount] = createSignal(0);
  const [coverBytes, setCoverBytes] = createSignal(0);
  const [coverDir, setCoverDir] = createSignal('');
  const [statsLoading, setStatsLoading] = createSignal(true);

  const refreshStats = async () => {
    setStatsLoading(true);
    try {
      const [{ getLyricCacheStats }, coverCache] = await Promise.all([
        import('@/lib/database/audio-lyric-cache'),
        import('@/lib/media/audio/music-cover-disk-cache'),
      ]);
      const [lyric, cover] = await Promise.all([
        getLyricCacheStats(),
        coverCache.getMusicCoverCacheStats(),
      ]);
      setLyricCount(lyric.count);
      setCoverCount(cover.count);
      setCoverBytes(cover.totalBytes);
      if (isTauri()) {
        setCoverDir(await coverCache.getMusicCoverCacheDirectory());
      } else {
        setCoverDir('');
      }
    } catch {
      /* ignore */
    } finally {
      setStatsLoading(false);
    }
  };

  onMount(() => {
    void (async () => {
      // 打开设置时顺带修复「盘上有缓存、库无索引」的历史缺口
      try {
        const { reconcileMusicTrackCacheIndex } = await import(
          '@/lib/media/audio/audio-disk-cache'
        );
        await reconcileMusicTrackCacheIndex();
      } catch {
        /* ignore */
      }
      await refreshStats();
    })();
  });

  const clearAuto = async () => {
    if (!confirm('清除自动播放缓存？已下载（manual）离线缓存不会删除。')) return;
    setClearingAuto(true);
    try {
      const { clearAutoMusicTrackCaches } = await import('@/lib/media/audio/audio-disk-cache');
      const n = await clearAutoMusicTrackCaches();
      showAppToast({ title: `已清除 ${n} 条自动缓存` });
    } catch (err) {
      showAppToast({
        title: '清除失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setClearingAuto(false);
    }
  };

  const reconcileIndex = async () => {
    setReconciling(true);
    try {
      const { reconcileMusicTrackCacheIndex } = await import(
        '@/lib/media/audio/audio-disk-cache'
      );
      const result = await reconcileMusicTrackCacheIndex();
      showAppToast({
        title:
          result.updated > 0
            ? `已回填 ${result.updated} 条缓存索引`
            : '没有可回填的索引',
        description:
          result.updated > 0
            ? `扫描磁盘 ${result.scanned} · 已对齐/无对应曲目 ${result.skipped}`
            : `扫描磁盘 ${result.scanned}。若列表曲经换源缓存到备用源 id，请再播放一次该曲以自动关联；新缓存将写入列表曲目 id。`,
      });
    } catch (err) {
      showAppToast({
        title: '修复失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setReconciling(false);
    }
  };

  const clearLyric = async () => {
    if (!confirm('清除已缓存的歌词？下次播放将重新在线拉取。')) return;
    setClearingLyric(true);
    try {
      const { clearAllLyricCache } = await import('@/lib/database/audio-lyric-cache');
      const n = await clearAllLyricCache();
      await refreshStats();
      showAppToast({ title: `已清除 ${n} 条歌词缓存` });
    } catch (err) {
      showAppToast({
        title: '清除失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setClearingLyric(false);
    }
  };

  const clearCover = async () => {
    if (!confirm('清除已缓存的专辑/歌单封面？')) return;
    setClearingCover(true);
    try {
      const { clearAllMusicCoverCache } = await import(
        '@/lib/media/audio/music-cover-disk-cache'
      );
      const { clearMusicCoverMemoryCache } = await import(
        '@/lib/media/audio/music-cover-loader'
      );
      await clearAllMusicCoverCache();
      clearMusicCoverMemoryCache();
      await refreshStats();
      showAppToast({ title: '封面缓存已清除' });
    } catch (err) {
      showAppToast({
        title: '清除失败',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setClearingCover(false);
    }
  };

  const coverSizeLabel = () => {
    const bytes = coverBytes();
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div class={props.embedded ? 'space-y-5' : 'space-y-5 p-4'}>
      {!props.embedded && (
        <div>
          <h2 class="text-sm font-medium">其他</h2>
          <p class="mt-1 text-xs text-muted-foreground">管理音乐缓存说明与不喜欢歌曲过滤规则。</p>
        </div>
      )}
      <section class="rounded-lg border p-4 text-sm">
        <h3 class="font-medium">缓存</h3>
        <p class="mt-2 text-xs text-muted-foreground">
          播放成功会写入自动缓存（auto）；下载会提升为持久离线缓存（manual）。歌词与封面会在首次加载后落盘/入库，避免重复网络请求。清理自动缓存不会删除已下载内容。若磁盘已有缓存但列表无「已缓存」标记，可修复索引。
        </p>
        <p class="mt-2 text-xs text-muted-foreground">
          {statsLoading()
            ? '正在读取缓存占用…'
            : `歌词 ${lyricCount()} 条 · 封面 ${coverCount()} 张（${coverSizeLabel()}）`}
        </p>
        {coverDir() ? (
          <p class="mt-1 break-all text-[11px] text-muted-foreground/80">封面目录：{coverDir()}</p>
        ) : null}
        <div class="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={clearingAuto()}
            onClick={() => void clearAuto()}
          >
            {clearingAuto() ? '清除中…' : '清除自动播放缓存'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={reconciling()}
            onClick={() => void reconcileIndex()}
          >
            {reconciling() ? '修复中…' : '修复缓存索引'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={clearingLyric()}
            onClick={() => void clearLyric()}
          >
            {clearingLyric() ? '清除中…' : '清除歌词缓存'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={clearingCover()}
            onClick={() => void clearCover()}
          >
            {clearingCover() ? '清除中…' : '清除封面缓存'}
          </Button>
        </div>
      </section>
      <section>
        <h3 class="mb-2 text-sm font-medium">不喜欢歌曲</h3>
        <AudioDislikePanel open inline embedded={props.embedded} />
      </section>
    </div>
  );
};
