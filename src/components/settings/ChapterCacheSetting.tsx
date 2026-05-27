/**
 * 设置页：章节正文缓存占用与清理、预取选项
 */

import { createSignal, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import {
  clearAllCachedChapters,
  clearInvalidChapterCache,
  formatChapterCacheSize,
  getChapterCacheSettings,
  getChapterCacheStats,
  saveChapterCacheSettings,
} from '@/lib/chapter-cache';
import { showAppToast } from '@/components/shared/AppToasts';

export function ChapterCacheSetting() {
  const [chapterCount, setChapterCount] = createSignal(0);
  const [totalBytes, setTotalBytes] = createSignal(0);
  const [prefetchEnabled, setPrefetchEnabled] = createSignal(true);
  const [prefetchCount, setPrefetchCount] = createSignal(1);
  const [preDownloadNum, setPreDownloadNum] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [clearing, setClearing] = createSignal(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [stats, settings] = await Promise.all([
        getChapterCacheStats(),
        getChapterCacheSettings(),
      ]);
      setChapterCount(stats.chapterCount);
      setTotalBytes(stats.estimatedBytes);
      setPrefetchEnabled(settings.prefetchEnabled);
      setPrefetchCount(settings.prefetchCount);
      setPreDownloadNum(settings.preDownloadNum);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refresh();
  });

  const persistSettings = async (patch: {
    prefetchEnabled?: boolean;
    prefetchCount?: number;
    preDownloadNum?: number;
  }) => {
    await saveChapterCacheSettings(patch);
    showAppToast({ title: '章节缓存设置已保存' });
  };

  const handleClearAll = async () => {
    if (!confirm('确定清除全部章节正文缓存？')) return;
    setClearing(true);
    try {
      await clearAllCachedChapters();
      await refresh();
      showAppToast({ title: '章节缓存已清除' });
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

  const handleClearInvalid = async () => {
    setClearing(true);
    try {
      const n = await clearInvalidChapterCache();
      await refresh();
      showAppToast({
        title: n > 0 ? `已清理 ${n} 本离架书籍的缓存` : '没有需要清理的离架缓存',
      });
    } catch (e) {
      showAppToast({
        title: '清理失败',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">章节正文缓存</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        在线阅读时自动缓存章节正文；大章节（&gt;512KB）会落盘到应用数据目录。与「封面缓存」「数据库备份」相互独立。
      </p>

      <Show when={!loading()} fallback={<p class="text-sm text-muted-foreground">统计加载中…</p>}>
        <p class="mb-4 text-sm">
          已缓存 <span class="font-medium">{chapterCount()}</span> 章，约{' '}
          <span class="font-medium">{formatChapterCacheSize(totalBytes())}</span>
        </p>
      </Show>

      <div class="mb-4 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span class="text-sm">阅读时后台缓存相邻章</span>
            <p class="text-xs text-muted-foreground">
              Reader 扩展：向前后各缓存少量章节，方便往回翻页；与下方「预下载」在向前方向会合并去重。
            </p>
          </div>
          <Switch
            checked={prefetchEnabled()}
            onChange={(v) => {
              setPrefetchEnabled(v);
              void persistSettings({ prefetchEnabled: v });
            }}
          >
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
            <SwitchLabel class="sr-only">阅读时后台缓存相邻章</SwitchLabel>
          </Switch>
        </div>
        <label class="flex items-center justify-between gap-4 text-sm">
          <span>相邻缓存章数（每侧 1–2）</span>
          <input
            type="number"
            min={1}
            max={2}
            class="w-16 rounded border border-border bg-background px-2 py-1"
            value={prefetchCount()}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              setPrefetchCount(v);
              void persistSettings({ prefetchCount: v });
            }}
          />
        </label>
        <label class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span>预下载章节数（0=关闭）</span>
            <p class="text-xs text-muted-foreground">
              对齐 Legado「预下载章节」：仅向当前章之后批量缓存（0=关闭，0–9999）。不负责往回翻，与上方相邻缓存分工。
            </p>
          </div>
          <input
            type="number"
            min={0}
            max={9999}
            class="w-20 shrink-0 rounded border border-border bg-background px-2 py-1"
            value={preDownloadNum()}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              setPreDownloadNum(v);
              void persistSettings({ preDownloadNum: v });
            }}
          />
        </label>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={clearing()}
          onClick={() => void handleClearInvalid()}
        >
          清理离架书籍缓存
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={clearing()}
          onClick={() => void handleClearAll()}
        >
          清除全部章节缓存
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          刷新统计
        </Button>
      </div>
    </div>
  );
}
