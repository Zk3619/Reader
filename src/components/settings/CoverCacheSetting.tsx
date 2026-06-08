/**
 * 设置页：封面磁盘/IndexedDB 缓存占用、目录与清理
 */

import { createEffect, createSignal, onMount, Show } from 'solid-js';
import { useSettingsPanelLoad } from '@/lib/settings/use-settings-panel-load';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { Button } from '@/components/ui/button';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import {
  clearAllCoverCache,
  formatCoverCacheSize,
  getCoverCacheStats,
} from '@/lib/http/cover-image-loader';
import { getCoverCacheDirectory } from '@/lib/cover/cover-disk-cache';
import {
  getCoverCacheSettings,
  saveCoverCacheSettings,
} from '@/lib/cover/cover-cache-settings';
import { isTauri } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';
import { showAppToast } from '@/components/shared/AppToasts';

type CoverCacheStatsSnapshot = {
  count: number;
  totalBytes: number;
  cacheDir: string;
};

export function CoverCacheSetting() {
  const [count, setCount] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);
  const [cacheDir, setCacheDir] = createSignal('');
  const [clearing, setClearing] = createSignal(false);
  const [pickingDir, setPickingDir] = createSignal(false);
  const [maxBytesMb, setMaxBytesMb] = createSignal(300);
  const [retentionDays, setRetentionDays] = createSignal(0);
  const [persistEnabled, setPersistEnabled] = createSignal(false);

  const statsPanel = useSettingsPanelLoad(
    'cover-cache-stats',
    async (): Promise<CoverCacheStatsSnapshot> => {
      const stats = await getCoverCacheStats();
      return {
        count: stats.count,
        totalBytes: stats.totalBytes,
        cacheDir: isTauri() ? await getCoverCacheDirectory() : '',
      };
    },
    { refreshOnMount: true },
  );

  onMount(() => {
    void getCoverCacheSettings().then((settings) => {
      setPersistEnabled(false);
      setMaxBytesMb(settings.maxBytesMb);
      setRetentionDays(settings.retentionDays);
      queueMicrotask(() => setPersistEnabled(true));
    });
  });

  createEffect(() => {
    const snap = statsPanel.data();
    if (!snap) return;
    setCount(snap.count);
    setTotalBytes(snap.totalBytes);
    setCacheDir(snap.cacheDir);
  });

  const statsLoading = () => statsPanel.loading();

  const refreshStats = async () => {
    try {
      await statsPanel.refresh({ silent: true });
    } catch (e) {
      showAppToast({
        title: '读取封面缓存统计失败',
        description: String(e),
        variant: 'destructive',
      });
    }
  };

  const persistField = async (
    key: 'maxBytesMb' | 'retentionDays',
    value: number,
  ) => {
    if (!persistEnabled()) return;
    const current = key === 'maxBytesMb' ? maxBytesMb() : retentionDays();
    if (current === value) return;

    if (key === 'maxBytesMb') setMaxBytesMb(value);
    else setRetentionDays(value);

    await saveCoverCacheSettings({ [key]: value });
    showAppToast({
      title: key === 'maxBytesMb' ? '封面缓存容量设置已保存' : '封面缓存保留期已保存',
    });
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearAllCoverCache();
      await refreshStats();
      showAppToast({ title: '封面缓存已清除', variant: 'default' });
    } catch (e) {
      showAppToast({
        title: '清除失败',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setClearing(false);
    }
  };

  const handlePickDirectory = async () => {
    if (!isTauri()) return;
    setPickingDir(true);
    try {
      const result = await pickDirectory();
      if (result.ref.kind === 'path') {
        await settingsStore.setCoverCacheDirectory(result.ref.value);
        await refreshStats();
        showAppToast({ title: '封面缓存目录已更新', variant: 'default' });
      }
    } catch (e) {
      if (isUserCancelled(e)) return;
      showAppToast({
        title: '选择目录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPickingDir(false);
    }
  };

  const handleResetDirectory = async () => {
    if (!isTauri()) return;
    setPickingDir(true);
    try {
      await settingsStore.setCoverCacheDirectory('');
      await refreshStats();
      showAppToast({ title: '已恢复默认封面缓存目录', variant: 'default' });
    } catch (e) {
      showAppToast({
        title: '恢复失败',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setPickingDir(false);
    }
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4">
        <h3 class="mb-2 font-semibold text-foreground">封面缓存</h3>
        <p class="text-sm text-muted-foreground">
          按书籍地址本地保存封面，重启后优先显示缓存，减少重复下载。每条缓存位于子目录{' '}
          <span class="font-mono text-xs">{'{hash}/'}</span>，内含{' '}
          <span class="font-mono text-xs">cover.bin</span> 与{' '}
          <span class="font-mono text-xs">meta.json</span>。超出上限时自动删除最旧条目。
        </p>
      </div>

      <div class="mb-4 space-y-3">
        <div class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>磁盘上限（MB，0=不限制）</span>
          <SettingsNumberField
            value={maxBytesMb()}
            min={0}
            max={10240}
            groupClass="w-28"
            onValueChange={(v) => void persistField('maxBytesMb', v)}
          />
        </div>
        <div class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>保留天数（0=仅按容量淘汰）</span>
          <SettingsNumberField
            value={retentionDays()}
            min={0}
            max={3650}
            groupClass="w-28"
            onValueChange={(v) => void persistField('retentionDays', v)}
          />
        </div>
      </div>

      <Show when={isTauri() && cacheDir()}>
        <div class="mb-4 rounded-lg border border-border/50 bg-muted/40 p-3 text-sm">
          <div class="mb-1 font-medium text-foreground">缓存目录</div>
          <p class="mb-2 break-all font-mono text-xs text-muted-foreground">
            {cacheDir()}
          </p>
          <p class="mb-2 text-xs text-muted-foreground">
            未单独指定时使用数据根目录下的 cover-cache（与数据库、本地书籍数据目录一致）。更改目录后，旧目录中的缓存不会自动迁移。
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pickingDir() || statsLoading()}
              onClick={() => void handlePickDirectory()}
            >
              {pickingDir() ? '处理中…' : '更改缓存目录'}
            </Button>
            <Show when={settingsStore.state.app.coverCacheDirectorySet}>
              <Button
                variant="ghost"
                size="sm"
                disabled={pickingDir() || statsLoading()}
                onClick={() => void handleResetDirectory()}
              >
                恢复默认
              </Button>
            </Show>
          </div>
        </div>
      </Show>

      <Show
        when={!statsLoading()}
        fallback={
          <p class="mb-4 text-sm text-muted-foreground">正在读取缓存统计…</p>
        }
      >
        <p class="mb-4 text-sm text-foreground">
          已缓存 <span class="font-medium">{count()}</span> 张封面，占用{' '}
          <span class="font-medium">{formatCoverCacheSize(totalBytes())}</span>
        </p>
      </Show>

      <div class="flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={statsLoading() || clearing() || count() === 0}
          onClick={() => void handleClear()}
        >
          {clearing() ? '清除中…' : '清除封面缓存'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={statsLoading()}
          onClick={() => void refreshStats()}
        >
          刷新统计
        </Button>
      </div>
    </div>
  );
}
