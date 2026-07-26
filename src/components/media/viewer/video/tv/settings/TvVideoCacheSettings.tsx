/**
 * 影视设置：剧集磁盘缓存占用 / 导出 / 清理 + 缩略图缓存
 */

import { createSignal, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/shared/AppToasts';
import { saveTextFile } from '@/lib/export/save-text-file';
import { isTauri } from '@/lib/platform/detect';
import {
  clearAllVideoCaches,
  clearAutoVideoCaches,
  exportVideoCacheManifest,
  formatVideoCacheSize,
  getVideoCacheStats,
  reconcileVideoEpisodeCacheIndex,
  type VideoCacheStats,
} from '@/lib/media/video/cache/video-disk-cache';
import {
  clearDanmakuCachesByTier,
  getDanmakuCacheStats,
} from '@/lib/media/video/danmaku/cache';
import { clearSeekThumbCache } from '@/lib/media/video/playback/sprite-store';

const EMPTY: VideoCacheStats = {
  count: 0,
  autoCount: 0,
  manualCount: 0,
  totalBytes: 0,
  mediaCount: 0,
  hlsMetaCount: 0,
  seekThumbBytes: 0,
  seekThumbSheets: 0,
};

type DanmakuStats = {
  count: number;
  autoCount: number;
  manualCount: number;
  totalBytes: number;
};

const EMPTY_DM: DanmakuStats = {
  count: 0,
  autoCount: 0,
  manualCount: 0,
  totalBytes: 0,
};

export function TvVideoCacheSettings() {
  const [stats, setStats] = createSignal<VideoCacheStats>(EMPTY);
  const [dmStats, setDmStats] = createSignal<DanmakuStats>(EMPTY_DM);
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal('');

  const refresh = async () => {
    setLoading(true);
    try {
      if (isTauri()) {
        await reconcileVideoEpisodeCacheIndex().catch(() => undefined);
      }
      const [v, d] = await Promise.all([
        getVideoCacheStats(),
        getDanmakuCacheStats(),
      ]);
      setStats(v);
      setDmStats(d);
    } catch {
      setStats(EMPTY);
      setDmStats(EMPTY_DM);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refresh();
  });

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy('');
    }
  };

  return (
    <div class="space-y-3">
      <h3 class="text-sm font-semibold">影视缓存</h3>
      <p class="text-xs text-muted-foreground">
        直链整文件会在播放后写入自动缓存（auto）；可提升为持久缓存（manual）。HLS/m3u8
        仅记录元数据，不下载分片。本地库路径只建索引、不复制文件。缩略图雪碧图按本地片源抽帧落盘。
      </p>
      <p class="text-xs text-muted-foreground">
        {loading()
          ? '正在读取缓存占用…'
          : (() => {
              const s = stats();
              const d = dmStats();
              return `剧集 ${s.count} 条（auto ${s.autoCount} / manual ${s.manualCount}）· 媒体 ${s.mediaCount} · HLS 元数据 ${s.hlsMetaCount} · 占用 ${formatVideoCacheSize(s.totalBytes)} · 缩略图 ${s.seekThumbSheets} 张（${formatVideoCacheSize(s.seekThumbBytes)}）· 弹幕 ${d.count} 条（auto ${d.autoCount} / manual ${d.manualCount}，${formatVideoCacheSize(d.totalBytes)}）`;
            })()}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() => void refresh()}
        >
          刷新占用
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('export', async () => {
              const json = await exportVideoCacheManifest();
              await saveTextFile('video-episode-cache.json', json, { moduleKey: 'video' });
              showAppToast({ title: '已导出缓存清单', variant: 'success' });
            })
          }
        >
          {busy() === 'export' ? '导出中…' : '导出清单'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('auto', async () => {
              if (!confirm('清除自动播放缓存？已标记为 manual 的不会删除。')) return;
              const n = await clearAutoVideoCaches();
              showAppToast({ title: `已清除 ${n} 条自动缓存`, variant: 'success' });
            })
          }
        >
          {busy() === 'auto' ? '清除中…' : '清除自动缓存'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('dm-auto', async () => {
              if (!confirm('清除自动弹幕缓存？manual 级保留。')) return;
              const n = await clearDanmakuCachesByTier('auto');
              showAppToast({ title: `已清除 ${n} 条自动弹幕缓存`, variant: 'success' });
            })
          }
        >
          {busy() === 'dm-auto' ? '清除中…' : '清除自动弹幕'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('dm-all', async () => {
              if (!confirm('清空全部弹幕缓存？')) return;
              const n = await clearDanmakuCachesByTier('all');
              showAppToast({ title: `已清空 ${n} 条弹幕缓存`, variant: 'success' });
            })
          }
        >
          {busy() === 'dm-all' ? '清空中…' : '清空弹幕缓存'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('all', async () => {
              if (!confirm('清空全部剧集缓存（含 manual）？此操作不可恢复。')) return;
              const n = await clearAllVideoCaches();
              showAppToast({ title: `已清除 ${n} 项`, variant: 'success' });
            })
          }
        >
          {busy() === 'all' ? '清除中…' : '清空全部剧集缓存'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('thumb', async () => {
              if (!confirm('清除本地进度条缩略图雪碧图缓存？')) return;
              const n = await clearSeekThumbCache();
              showAppToast({ title: `已清除 ${n} 组缩略图`, variant: 'success' });
            })
          }
        >
          {busy() === 'thumb' ? '清除中…' : '清除缩略图缓存'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!busy()}
          onClick={() =>
            void run('reconcile', async () => {
              const r = await reconcileVideoEpisodeCacheIndex();
              showAppToast({
                title: `已回填 ${r.updated} / ${r.scanned} 条索引`,
                variant: 'success',
              });
            })
          }
        >
          {busy() === 'reconcile' ? '修复中…' : '修复缓存索引'}
        </Button>
      </div>
    </div>
  );
}
