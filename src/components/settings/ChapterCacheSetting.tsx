/**
 * 设置页：阅读缓存占用与清理、容量/保留策略
 */

import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import {
  invalidateSettingsPanelCache,
  patchSettingsPanelCache,
  useSettingsPanelLoad,
} from '@/lib/settings/use-settings-panel-load';
import { Button } from '@/components/ui/button';
import { SettingsNumberField } from '@/components/settings/SettingsNumberField';
import {
  clearAllCachedChapters,
  clearInvalidChapterCache,
  formatChapterCacheSize,
  getChapterCacheSettings,
  getChapterCacheStats,
  saveChapterCacheSettings,
  type ChapterCacheStorageBreakdown,
} from '@/lib/chapter-cache';
import { showAppToast } from '@/components/shared/AppToasts';

type ChapterCacheSnapshot = {
  chapterCount: number;
  autoChapterCount: number;
  manualChapterCount: number;
  breakdown: ChapterCacheStorageBreakdown;
  totalBytes: number;
  maxBytesMb: number;
  retentionDays: number;
  mangaImageRetainNum: number;
};

export function ChapterCacheSetting() {
  const [chapterCount, setChapterCount] = createSignal(0);
  const [autoChapterCount, setAutoChapterCount] = createSignal(0);
  const [manualChapterCount, setManualChapterCount] = createSignal(0);
  const [breakdown, setBreakdown] = createSignal<ChapterCacheStorageBreakdown>({
    bodyBytes: 0,
    mangaImageCount: 0,
    mangaImageBytes: 0,
    mediaPlaybackBytes: 0,
  });
  const [totalBytes, setTotalBytes] = createSignal(0);
  const [maxBytesMb, setMaxBytesMb] = createSignal(0);
  const [retentionDays, setRetentionDays] = createSignal(0);
  const [mangaImageRetainNum, setMangaImageRetainNum] = createSignal(2);
  const [clearing, setClearing] = createSignal(false);
  /** 数据灌入 NumberField 期间禁止误触发持久化（Kobalte 挂载时会同步 rawValue） */
  const [persistEnabled, setPersistEnabled] = createSignal(false);

  const panel = useSettingsPanelLoad(
    'chapter-cache',
    async (): Promise<ChapterCacheSnapshot> => {
      const [stats, settings] = await Promise.all([
        getChapterCacheStats(),
        getChapterCacheSettings(),
      ]);
      return {
        chapterCount: stats.chapterCount,
        autoChapterCount: stats.autoChapterCount,
        manualChapterCount: stats.manualChapterCount,
        breakdown: stats.breakdown,
        totalBytes: stats.totalBytes,
        maxBytesMb: settings.maxBytesMb,
        retentionDays: settings.retentionDays,
        mangaImageRetainNum: settings.mangaImageRetainNum,
      };
    },
    { refreshOnMount: true },
  );

  const normalizeBreakdown = (
    snap: ChapterCacheSnapshot,
  ): ChapterCacheStorageBreakdown =>
    snap.breakdown ?? {
      bodyBytes: snap.totalBytes,
      mangaImageCount: 0,
      mangaImageBytes: 0,
      mediaPlaybackBytes: 0,
    };

  createEffect(() => {
    const snap = panel.data();
    if (!snap) return;
    setPersistEnabled(false);
    setChapterCount(snap.chapterCount);
    setAutoChapterCount(snap.autoChapterCount);
    setManualChapterCount(snap.manualChapterCount);
    setBreakdown(normalizeBreakdown(snap));
    setTotalBytes(snap.totalBytes);
    setMaxBytesMb(snap.maxBytesMb);
    setRetentionDays(snap.retentionDays);
    setMangaImageRetainNum(snap.mangaImageRetainNum);
    queueMicrotask(() => setPersistEnabled(true));
  });

  onMount(() => {
    const onCacheUpdated = () => {
      invalidateSettingsPanelCache('chapter-cache');
      void panel.refresh({ silent: true }).catch(() => {});
    };
    window.addEventListener('chapter-cache-updated', onCacheUpdated);
    onCleanup(() => window.removeEventListener('chapter-cache-updated', onCacheUpdated));
  });

  const loading = () => panel.loading();
  const refresh = () => {
    invalidateSettingsPanelCache('chapter-cache');
    return panel.refresh({ silent: true });
  };

  const persistField = async (
    key: 'maxBytesMb' | 'retentionDays' | 'mangaImageRetainNum',
    value: number,
  ) => {
    if (!persistEnabled()) return;
    const snap = panel.data();
    if (!snap || snap[key] === value) return;

    if (key === 'maxBytesMb') setMaxBytesMb(value);
    else if (key === 'retentionDays') setRetentionDays(value);
    else setMangaImageRetainNum(value);

    await saveChapterCacheSettings({ [key]: value });
    patchSettingsPanelCache<ChapterCacheSnapshot>('chapter-cache', { [key]: value });
    showAppToast({ title: '阅读缓存设置已保存' });
  };

  const handleClearAll = async () => {
    if (!confirm('确定清除全部章节正文与漫画图片缓存？')) return;
    setClearing(true);
    try {
      await clearAllCachedChapters();
      invalidateSettingsPanelCache('chapter-cache');
      await refresh();
      showAppToast({ title: '阅读缓存已清除' });
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
      <h3 class="mb-2 font-semibold text-foreground">阅读缓存</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        章节正文（文本/漫画 HTML/音视频章页面等）与漫画图片分开展示占用。阅读时自动写入的正文受下方容量与保留期约束；书架「离线缓存」与阅读器缓存按钮写入的内容归用户管理，不受自动清理影响。大章节正文（&gt;512KB）会落盘到应用数据目录。向前/向后预下载在各阅读器设置中配置。
      </p>

      <Show when={panel.error()}>
        <p class="mb-4 text-sm text-destructive">
          统计加载失败：{panel.error()}。请尝试刷新。
        </p>
      </Show>

      <Show when={!loading()} fallback={<p class="text-sm text-muted-foreground">统计加载中…</p>}>
        <div class="mb-4 space-y-2 text-sm">
          <p>
            已缓存章节正文{' '}
            <span class="font-medium">{chapterCount()}</span> 章（自动{' '}
            <span class="font-medium">{autoChapterCount()}</span> · 离线{' '}
            <span class="font-medium">{manualChapterCount()}</span>）
          </p>
          <ul class="space-y-1 text-muted-foreground">
            <li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span>章节正文</span>
              <span class="font-medium tabular-nums text-foreground">
                {formatChapterCacheSize(breakdown().bodyBytes)}
              </span>
            </li>
            <li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span>
                漫画图片
                <Show when={breakdown().mangaImageCount > 0}>
                  <span class="text-xs">（{breakdown().mangaImageCount} 张）</span>
                </Show>
              </span>
              <span class="font-medium tabular-nums text-foreground">
                {formatChapterCacheSize(breakdown().mangaImageBytes)}
              </span>
            </li>
            <li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span class="text-xs">音视频播放缓存</span>
              <span class="text-xs tabular-nums">暂无持久化</span>
            </li>
          </ul>
          <p class="border-t border-border/50 pt-2">
            合计约{' '}
            <span class="font-medium tabular-nums">{formatChapterCacheSize(totalBytes())}</span>
          </p>
        </div>
      </Show>

      <Show when={panel.data()}>
        <div class="mb-4 space-y-3">
        <div class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span>正文自动缓存上限（MB，0=不限制）</span>
            <p class="text-xs text-muted-foreground">
              仅约束章节正文中的阅读自动缓存；不含漫画图片。用户离线缓存不计入此上限且不会被自动清理。
            </p>
          </div>
          <SettingsNumberField
            value={maxBytesMb()}
            min={0}
            max={102400}
            groupClass="w-28"
            onValueChange={(v) => void persistField('maxBytesMb', v)}
          />
        </div>
        <div class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span>漫画图片保留章数（当前章 ±N）</span>
            <p class="text-xs text-muted-foreground">
              对齐 Legado imageRetainNum：阅读时仅保留当前章前后 N 章的漫画磁盘图片；用户离线缓存的章节图片不会被自动清理。
            </p>
          </div>
          <SettingsNumberField
            value={mangaImageRetainNum()}
            min={0}
            max={30}
            onValueChange={(v) => void persistField('mangaImageRetainNum', v)}
          />
        </div>
        <div class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span>正文自动缓存保留天数（0=不按时间清理）</span>
            <p class="text-xs text-muted-foreground">
              仅清理阅读自动缓存的章节正文，不影响漫画图片与用户离线缓存。
            </p>
          </div>
          <SettingsNumberField
            value={retentionDays()}
            min={0}
            max={3650}
            groupClass="w-28"
            onValueChange={(v) => void persistField('retentionDays', v)}
          />
        </div>
        </div>
      </Show>

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
          清除全部阅读缓存
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          刷新统计
        </Button>
      </div>
    </div>
  );
}
