/**
 * 设置页：封面磁盘/IndexedDB 缓存占用、目录与清除
 */

import { createSignal, onMount, Show } from 'solid-js';
import { pickDirectory } from '@/lib/platform/fs/pick-directory';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { Button } from '@/components/ui/button';
import {
  clearAllCoverCache,
  formatCoverCacheSize,
  getCoverCacheStats,
} from '@/lib/http/cover-image-loader';
import { getCoverCacheDirectory } from '@/lib/cover/cover-disk-cache';
import { isTauri } from '@/lib/platform/detect';
import { settingsStore } from '@/stores/settings';
import { showAppToast } from '@/components/shared/AppToasts';

export function CoverCacheSetting() {
  const [count, setCount] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);
  const [cacheDir, setCacheDir] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [clearing, setClearing] = createSignal(false);
  const [pickingDir, setPickingDir] = createSignal(false);

  const refreshStats = async () => {
    setLoading(true);
    try {
      const stats = await getCoverCacheStats();
      setCount(stats.count);
      setTotalBytes(stats.totalBytes);
      if (isTauri()) {
        setCacheDir(await getCoverCacheDirectory());
      }
    } catch (e) {
      console.error('[CoverCacheSetting] refreshStats', e);
      showAppToast({
        title: '读取封面缓存统计失败',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refreshStats();
  });

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
        description:
          e instanceof Error ? e.message : String(e),
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
          <span class="font-mono text-xs">meta.json</span>。上限约 300MB，超出时自动删除最旧条目。
        </p>
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
              disabled={pickingDir() || loading()}
              onClick={() => void handlePickDirectory()}
            >
              {pickingDir() ? '处理中…' : '更改缓存目录'}
            </Button>
            <Show when={settingsStore.state.app.coverCacheDirectorySet}>
              <Button
                variant="ghost"
                size="sm"
                disabled={pickingDir() || loading()}
                onClick={() => void handleResetDirectory()}
              >
                恢复默认
              </Button>
            </Show>
          </div>
        </div>
      </Show>
      <Show
        when={!loading()}
        fallback={
          <p class="text-sm text-muted-foreground">正在读取缓存信息…</p>
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
          disabled={loading() || clearing() || count() === 0}
          onClick={() => void handleClear()}
        >
          {clearing() ? '清除中…' : '清除封面缓存'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading()}
          onClick={() => void refreshStats()}
        >
          刷新统计
        </Button>
      </div>
    </div>
  );
}
