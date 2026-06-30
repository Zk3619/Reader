/**
 * 设置页：目录分页安全阈值（nextTocUrl 防无限翻页）
 */

import { createEffect, createSignal } from 'solid-js';
import { AppSwitch, AppSwitchControl, AppSwitchLabel, AppSwitchThumb } from '@/components/shared/AppSwitch';
import { showAppToast } from '@/components/shared/AppToasts';
import { settingsStore } from '@/stores/settings';

export function TocPaginationSafetySetting() {
  const [enabled, setEnabled] = createSignal(
    settingsStore.state.app.tocPaginationSafetyEnabled !== false,
  );
  const [maxPages, setMaxPages] = createSignal(
    settingsStore.state.app.tocPaginationMaxPages ?? 80,
  );

  createEffect(() => {
    setEnabled(settingsStore.state.app.tocPaginationSafetyEnabled !== false);
    setMaxPages(settingsStore.state.app.tocPaginationMaxPages ?? 80);
  });

  const persist = async (nextEnabled: boolean, nextMaxPages: number) => {
    const normalized = Math.max(1, Math.min(2000, Math.floor(nextMaxPages)));
    await settingsStore.setTocPaginationSafety(nextEnabled, normalized);
    showAppToast({
      title: '目录分页安全阈值已保存',
      description: nextEnabled ? `最大抓取页数：${normalized}` : '已关闭阈值限制',
    });
  };

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <h3 class="mb-2 font-semibold text-foreground">目录分页安全阈值</h3>
      <p class="mb-4 text-sm text-muted-foreground">
        针对目录的 nextTocUrl 分页抓取设置安全上限，避免规则异常时无限翻页。达到阈值会中止并弹出通知。
      </p>

      <div class="space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span class="text-sm">启用分页安全阈值</span>
            <p class="text-xs text-muted-foreground">建议保持开启，防止目录抓取死循环。</p>
          </div>
          <AppSwitch
            checked={enabled()}
            onChange={(v) => {
              setEnabled(v);
              void persist(v, maxPages());
            }}
          >
            <AppSwitchControl>
              <AppSwitchThumb />
            </AppSwitchControl>
            <AppSwitchLabel class="sr-only">启用分页安全阈值</AppSwitchLabel>
          </AppSwitch>
        </div>

        <label class="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 flex-1 space-y-0.5">
            <span>最大目录页数（1-2000）</span>
            <p class="text-xs text-muted-foreground">超过该页数后停止继续抓取 nextTocUrl。</p>
          </div>
          <input
            type="number"
            min={1}
            max={2000}
            class="w-24 shrink-0 rounded border border-border bg-background px-2 py-1"
            value={maxPages()}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              const normalized = Number.isFinite(v) ? Math.max(1, Math.min(2000, Math.floor(v))) : 80;
              setMaxPages(normalized);
              void persist(enabled(), normalized);
            }}
          />
        </label>
      </div>
    </div>
  );
}
