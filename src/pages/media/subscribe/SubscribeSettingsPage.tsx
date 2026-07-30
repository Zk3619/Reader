/**
 * 订阅模块设置
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import {
  AppSwitch,
  AppSwitchControl,
  AppSwitchThumb,
} from '@/components/shared/AppSwitch';
import { AppTextFieldBareInput, AppTextFieldInput } from '@/components/shared/AppTextField';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { createResource, createSignal, For, Show } from 'solid-js';
import {
  getSubscribeConfig,
  saveSubscribeConfig,
} from '@/lib/persistence/domains/subscribe-config';
import {
  getSubscribeFoloAuth,
  subscribeFoloAuthRevision,
} from '@/lib/persistence/domains/subscribe-folo-auth';
import { listSubSources, setSubSourceEnabled } from '@/lib/database/subscribe';
import {
  exportSubscribeOpml,
  importSubscribeOpml,
  removeSubscribeSource,
  updateSubscribeSource,
} from '@/lib/subscribe/service';
import {
  loginFoloWithBrowser,
  loginFoloWithSessionToken,
  logoutFoloAccount,
  refreshFoloAuthSession,
  syncFoloSubscriptionsToLocal,
} from '@/lib/subscribe/folo-account';
import { showAppToast } from '@/components/shared/AppToasts';
import { formatSubscribeTime } from '@/lib/subscribe/presentation';
import { pickFiles } from '@/lib/platform/fs/pick-file';
import type { PickResult } from '@/lib/platform/fs/pick-types';
import { isUserCancelled } from '@/lib/platform/fs/errors';
import { downloadTextFile } from '@/lib/shared/download-source-scripts';
import { readTextFile } from '@/lib/platform/filesystem';
import { isTauri } from '@/lib/platform/detect';

async function textFromPickResult(p: PickResult): Promise<string> {
  if (p.legacyFile) return p.legacyFile.text();
  if (p.bytes) return new TextDecoder().decode(p.bytes);
  if (p.ref.kind === 'path') return readTextFile(p.ref.value);
  throw new Error('无法读取所选文件');
}

export function SubscribeSettingsPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [config, { refetch: refetchConfig }] = createResource(() => getSubscribeConfig());
  const [sources, { refetch: refetchSources }] = createResource(() => listSubSources());
  const [foloAuth, { refetch: refetchFoloAuth }] = createResource(
    subscribeFoloAuthRevision,
    () => getSubscribeFoloAuth(),
  );
  const [busy, setBusy] = createSignal('');
  const [manualToken, setManualToken] = createSignal('');
  const [loginStatus, setLoginStatus] = createSignal('');

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

  async function doBrowserLogin() {
    setBusy('正在登录 Folo…');
    setLoginStatus('准备中…');
    try {
      const auth = await loginFoloWithBrowser({
        onStatus: (message) => setLoginStatus(message),
      });
      await refetchFoloAuth();
      showAppToast({
        title: '已登录 Folo',
        description: auth.userEmail || auth.userName || '会话已保存',
        variant: 'success',
      });
      setLoginStatus('');
    } catch (error) {
      showAppToast({
        title: '登录失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function doManualLogin() {
    setBusy('正在校验会话…');
    try {
      const auth = await loginFoloWithSessionToken(manualToken());
      setManualToken('');
      await refetchFoloAuth();
      showAppToast({
        title: '已登录 Folo',
        description: auth.userEmail || auth.userName || '会话已保存',
        variant: 'success',
      });
    } catch (error) {
      showAppToast({
        title: '会话无效',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function doRefreshSession() {
    setBusy('正在刷新会话…');
    try {
      const auth = await refreshFoloAuthSession();
      await refetchFoloAuth();
      if (!auth) {
        showAppToast({ title: '会话已失效，请重新登录', variant: 'error' });
        return;
      }
      showAppToast({ title: '会话有效', variant: 'success' });
    } catch (error) {
      showAppToast({
        title: '刷新失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'error',
      });
    } finally {
      setBusy('');
    }
  }

  async function doLogout() {
    setBusy('正在退出…');
    try {
      await logoutFoloAccount();
      await refetchFoloAuth();
      showAppToast({ title: '已退出 Folo 账号' });
    } finally {
      setBusy('');
      setLoginStatus('');
    }
  }

  async function doSyncSubscriptions() {
    setBusy('正在从 Folo 拉取订阅…');
    try {
      const result = await syncFoloSubscriptionsToLocal();
      await refetchSources();
      await refetchFoloAuth();
      showAppToast({
        title: '云同步完成（单向拉取）',
        description: `共 ${result.total} 个 feed · 新增 ${result.imported} · 已存在 ${result.skipped}`,
        variant: 'success',
      });
    } catch (error) {
      showAppToast({
        title: '同步失败',
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
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 w-full flex-1 flex-col gap-4 pb-4">
          <section class="rounded-2xl border border-border/50 bg-card p-6">
            <h3 class="text-sm font-semibold">订阅行为</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              仅影响新订阅模块（`sub_*`），不影响阅读模块 legado RSS。
            </p>
            <div class="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <div>
                <div class="text-sm">进入源时自动刷新</div>
                <div class="text-xs text-muted-foreground">选中某个订阅源后自动抓取最新条目</div>
              </div>
              <AppSwitch
                checked={config()?.autoRefreshOnOpen ?? false}
                onChange={(checked) =>
                  void saveSubscribeConfig({ autoRefreshOnOpen: checked }).then(() =>
                    refetchConfig(),
                  )
                }
                aria-label="进入源时自动刷新"
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <div class="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <div>
                <div class="text-sm">发现广场</div>
                <div class="text-xs text-muted-foreground">
                  免登录拉取 Folo 公开趋势与 RSSHub 分类，订阅写入本地 `sub_*`
                </div>
              </div>
              <AppSwitch
                checked={config()?.foloDiscoverEnabled !== false}
                onChange={(checked) =>
                  void saveSubscribeConfig({ foloDiscoverEnabled: checked }).then(() =>
                    refetchConfig(),
                  )
                }
                aria-label="发现广场"
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
          </section>

          <section class="rounded-2xl border border-border/50 bg-card p-6">
            <h3 class="text-sm font-semibold">实验功能</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              默认关闭。依赖 Folo 云账号与非公开后端契约，可能随时失效，且受对方服务条款约束（个人非商用）。
              会话 token 仅保存在本机，不会随应用备份导出。
            </p>
            <div class="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <div>
                <div class="text-sm">Folo 账号登录与云同步</div>
                <div class="text-xs text-muted-foreground">
                  {config()?.foloCloudAccountEnabled
                    ? '已开启：支持浏览器登录 / 粘贴 token，以及单向拉取云订阅到本地 sub_*'
                    : '开启后显示登录与同步入口'}
                </div>
              </div>
              <AppSwitch
                checked={config()?.foloCloudAccountEnabled ?? false}
                onChange={(checked) =>
                  void saveSubscribeConfig({
                    foloCloudAccountEnabled: checked,
                  }).then(() => {
                    void refetchConfig();
                    if (checked) {
                      showAppToast({
                        title: '已开启实验开关',
                        description: '可在下方登录 Folo 账号',
                      });
                    }
                  })
                }
                aria-label="Folo 账号登录与云同步"
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <Show when={config()?.foloCloudAccountEnabled}>
              <div class="mt-3 space-y-3 rounded-lg border px-3 py-3">
                <Show
                  when={foloAuth()?.sessionToken}
                  fallback={
                    <div class="space-y-3">
                      <p class="text-xs text-muted-foreground">
                        当前未登录。桌面端可打开浏览器完成 CLI 同款回调登录；也可粘贴已有会话
                        token（Bearer / better-auth.session_token）。
                      </p>
                      <Show when={isTauri()}>
                        <div class="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={!!busy()}
                            onClick={() => void doBrowserLogin()}
                          >
                            浏览器登录
                          </Button>
                          <Show when={loginStatus()}>
                            <span class="text-xs text-muted-foreground">{loginStatus()}</span>
                          </Show>
                        </div>
                      </Show>
                      <div class="space-y-2">
                        <AppTextFieldInput
                          layout="bare"
                          type="password"
                          placeholder="粘贴 Folo session token"
                          value={manualToken()}
                          onInput={(e) => setManualToken(e.currentTarget.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!manualToken().trim() || !!busy()}
                          onClick={() => void doManualLogin()}
                        >
                          用 Token 登录
                        </Button>
                      </div>
                    </div>
                  }
                >
                  <div class="space-y-3">
                    <div>
                      <div class="text-sm font-medium">
                        {foloAuth()?.userName || foloAuth()?.userEmail || '已登录'}
                      </div>
                      <Show when={foloAuth()?.userEmail && foloAuth()?.userName}>
                        <div class="text-xs text-muted-foreground">{foloAuth()?.userEmail}</div>
                      </Show>
                      <div class="mt-1 text-[11px] text-muted-foreground">
                        登录于 {formatSubscribeTime(foloAuth()?.loggedInAt ?? null) || '未知'}
                        <Show when={foloAuth()?.lastSyncedAt}>
                          {' '}
                          · 上次同步 {formatSubscribeTime(foloAuth()?.lastSyncedAt ?? null)}
                        </Show>
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!!busy()}
                        onClick={() => void doSyncSubscriptions()}
                      >
                        拉取云订阅到本地
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy()}
                        onClick={() => void doRefreshSession()}
                      >
                        校验会话
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        class="text-destructive"
                        disabled={!!busy()}
                        onClick={() => void doLogout()}
                      >
                        退出登录
                      </Button>
                    </div>
                    <p class="text-[11px] text-muted-foreground">
                      同步为单向：仅把云端带 URL 的 feed 写入本地 `sub_*`，不上传本地订阅，也不同步已读/收藏。
                    </p>
                  </div>
                </Show>
              </div>
            </Show>
          </section>

          <section class="rounded-2xl border border-border/50 bg-card p-6">
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

          <section class="rounded-2xl border border-border/50 bg-card p-6">
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
                        <AppTextFieldBareInput
                          layout="compact"
                          fieldClass="min-w-0 flex-1"
                          placeholder="分类/文件夹"
                          value={source.category ?? ''}
                          onBlur={(e: FocusEvent) => {
                            const category = (e.currentTarget as HTMLInputElement).value.trim();
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
