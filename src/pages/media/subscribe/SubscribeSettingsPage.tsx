/**
 * 订阅模块设置
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setSubscribeSection } from '@/stores/subscribe-hub/section';
import { createResource, createSignal, For, Show } from 'solid-js';
import {
  getSubscribeConfig,
  saveSubscribeConfig,
} from '@/lib/persistence/domains/subscribe-config';
import { listSubSources, setSubSourceEnabled } from '@/lib/database/subscribe';
import {
  exportSubscribeOpml,
  importSubscribeOpml,
  removeSubscribeSource,
  updateSubscribeSource,
} from '@/lib/subscribe/service';
import { showAppToast } from '@/components/shared/AppToasts';
import { formatSubscribeTime } from '@/lib/subscribe/presentation';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import type { PickResult } from '@/lib/platform/fs/pick-types';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { downloadTextFile } from '@/lib/shared/download-source-scripts';
import { readTextFile } from '@/lib/platform/filesystem';

export interface SubscribeSettingsPageProps {
  onBack?: () => void;
}

async function textFromPickResult(p: PickResult): Promise<string> {
  if (p.legacyFile) return p.legacyFile.text();
  if (p.bytes) return new TextDecoder().decode(p.bytes);
  if (p.ref.kind === 'path') return readTextFile(p.ref.value);
  throw new Error('无法读取所选文件');
}

export function SubscribeSettingsPage(props: SubscribeSettingsPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [config, { refetch: refetchConfig }] = createResource(() => getSubscribeConfig());
  const [sources, { refetch: refetchSources }] = createResource(() => listSubSources());
  const [busy, setBusy] = createSignal('');

  async function doImportOpml() {
    setBusy('正在导入 OPML...');
    try {
      const picked = await pickFiles({
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
        multiple: false,
      });
      if (!picked.length) return;
      const xml = await textFromPickResult(picked[0]!);
      const result = await importSubscribeOpml(xml);
      await refetchSources();
      showAppToast({
        title: 'OPML 导入完成',
        description: `新增 ${result.imported}，已存在 ${result.skipped}`,
        variant: 'success',
      });
    } catch (error) {
      if (isUserCancelled(error)) return;
      showAppToast({
        title: 'OPML 导入失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function doExportOpml() {
    setBusy('正在导出 OPML...');
    try {
      const opml = await exportSubscribeOpml();
      downloadTextFile(opml, 'reader-subscribe.opml', 'text/x-opml;charset=utf-8');
      showAppToast({ title: '已导出 OPML', variant: 'success' });
    } catch (error) {
      showAppToast({
        title: 'OPML 导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="订阅设置"
        description="独立订阅模块配置"
        titleSlot={
          <PageToolbarTitleDropdown
            title="订阅设置"
            description="独立订阅模块配置"
            dropdownEnabled={false}
          />
        }
        leading={
          props.onBack ? (
            <SettingsToolbarLeading
              onBack={() => {
                setSubscribeSection('home');
                props.onBack?.();
              }}
            />
          ) : undefined
        }
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-4 p-4">
          <section class="rounded-xl border bg-card p-4 shadow-sm">
            <h3 class="text-sm font-semibold">订阅行为</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              仅影响新订阅模块（`sub_*`），不影响阅读模块 legado RSS。
            </p>
            <div class="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <div>
                <div class="text-sm">进入源时自动刷新</div>
                <div class="text-xs text-muted-foreground">选中某个订阅源后自动抓取最新条目</div>
              </div>
              <Button
                size="sm"
                variant={config()?.autoRefreshOnOpen ? 'default' : 'outline'}
                onClick={() =>
                  void saveSubscribeConfig({
                    autoRefreshOnOpen: !config()?.autoRefreshOnOpen,
                  }).then(() => refetchConfig())
                }
              >
                {config()?.autoRefreshOnOpen ? '已开启' : '已关闭'}
              </Button>
            </div>
          </section>

          <section class="rounded-xl border bg-card p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold">OPML 导入 / 导出</h3>
                <p class="mt-1 text-xs text-muted-foreground">
                  仅写入 `sub_*` 表。文件夹对应分类字符串。
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" disabled={!!busy()} onClick={() => void doImportOpml()}>
                  导入
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy()} onClick={() => void doExportOpml()}>
                  导出
                </Button>
              </div>
            </div>
            <Show when={busy()}>
              <div class="text-xs text-muted-foreground">{busy()}</div>
            </Show>
          </section>

          <section class="rounded-xl border bg-card p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold">已添加的订阅源</h3>
                <p class="mt-1 text-xs text-muted-foreground">
                  共 {sources()?.length ?? 0} 个源
                </p>
              </div>
            </div>
            <Show
              when={(sources()?.length ?? 0) > 0}
              fallback={
                <div class="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  还没有订阅源
                </div>
              }
            >
              <div class="space-y-2">
                <For each={sources() ?? []}>
                  {(source) => (
                    <div class="rounded-lg border px-3 py-3">
                      <div class="flex items-start gap-3">
                        <div class="min-w-0 flex-1">
                          <div class="truncate text-sm font-medium">
                            {source.title || source.url}
                          </div>
                          <div class="truncate text-xs text-muted-foreground">{source.url}</div>
                          <div class="mt-1 text-[11px] text-muted-foreground">
                            分类：{source.category?.trim() || '未分类'} · 上次刷新：
                            {formatSubscribeTime(source.lastFetchAt) || '从未'}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void setSubSourceEnabled(source.id, !source.enabled).then(() =>
                              refetchSources(),
                            )
                          }
                        >
                          {source.enabled ? '停用' : '启用'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          class="text-destructive"
                          onClick={() =>
                            void removeSubscribeSource(source.id).then(() => {
                              showAppToast({ title: '已删除订阅源' });
                              void refetchSources();
                            })
                          }
                        >
                          删除
                        </Button>
                      </div>
                      <div class="mt-2 flex items-center gap-2">
                        <input
                          class="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
                          placeholder="分类/文件夹"
                          value={source.category ?? ''}
                          onBlur={(e) => {
                            const category = e.currentTarget.value.trim();
                            if (category === (source.category ?? '').trim()) return;
                            void updateSubscribeSource(source.id, { category }).then(() =>
                              refetchSources(),
                            );
                          }}
                        />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </div>
      </div>
    </section>
  );
}
