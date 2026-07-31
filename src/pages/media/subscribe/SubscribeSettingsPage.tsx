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
import { createEffect, createResource, createSignal, Show } from 'solid-js';
import {
  getSubscribeConfig,
  saveSubscribeConfig,
  subscribeConfigRevision,
} from '@/lib/persistence/domains/subscribe-config';
import {
  SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES,
  SUBSCRIBE_REFRESH_INTERVAL_MAX_MINUTES,
  SUBSCRIBE_REFRESH_INTERVAL_MIN_MINUTES,
} from '@/lib/subscribe/refresh-interval';
import {
  getSubscribeFoloAuth,
  subscribeFoloAuthRevision,
} from '@/lib/persistence/domains/subscribe-folo-auth';
import {
  loginFoloWithBrowser,
  loginFoloWithSessionToken,
  logoutFoloAccount,
  refreshFoloAuthSession,
  syncFoloSubscriptionsToLocal,
} from '@/lib/subscribe/folo-account';
import { showAppToast } from '@/components/shared/AppToasts';
import { formatSubscribeTime } from '@/lib/subscribe/presentation';
import { isTauri } from '@/lib/platform/detect';

export function SubscribeSettingsPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [config, { refetch: refetchConfig }] = createResource(
    subscribeConfigRevision,
    () => getSubscribeConfig(),
  );
  const [foloAuth, { refetch: refetchFoloAuth }] = createResource(
    subscribeFoloAuthRevision,
    () => getSubscribeFoloAuth(),
  );
  const [busy, setBusy] = createSignal('');
  const [manualToken, setManualToken] = createSignal('');
  const [loginStatus, setLoginStatus] = createSignal('');
  const [intervalDraft, setIntervalDraft] = createSignal(
    String(SUBSCRIBE_REFRESH_INTERVAL_DEFAULT_MINUTES),
  );

  createEffect(() => {
    const minutes = config()?.autoRefreshIntervalMinutes;
    if (minutes != null) setIntervalDraft(String(minutes));
  });

  async function commitRefreshInterval() {
    await saveSubscribeConfig({
      autoRefreshIntervalMinutes: Number(intervalDraft()),
    });
    await refetchConfig();
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
              <div class="min-w-0 flex-1">
                <div class="text-sm">定期自动刷新全部源</div>
                <div class="text-xs text-muted-foreground">
                  按下方间隔静默刷新已启用订阅（不弹 CF）；默认关闭
                </div>
              </div>
              <AppSwitch
                checked={config()?.periodicRefreshEnabled ?? false}
                onChange={(checked) =>
                  void saveSubscribeConfig({ periodicRefreshEnabled: checked }).then(() =>
                    refetchConfig(),
                  )
                }
                aria-label="定期自动刷新全部源"
              >
                <AppSwitchControl>
                  <AppSwitchThumb />
                </AppSwitchControl>
              </AppSwitch>
            </div>
            <div class="mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <div class="min-w-0 flex-1">
                <div class="text-sm">自动刷新间隔（分钟）</div>
                <div class="text-xs text-muted-foreground">
                  用于进入源冷却与定期刷新，范围 5～1440，默认 30
                </div>
              </div>
              <AppTextFieldBareInput
                type="number"
                class="h-9 w-24 text-right"
                min={SUBSCRIBE_REFRESH_INTERVAL_MIN_MINUTES}
                max={SUBSCRIBE_REFRESH_INTERVAL_MAX_MINUTES}
                step={1}
                value={intervalDraft()}
                onInput={(e) => setIntervalDraft(e.currentTarget.value)}
                onBlur={() => void commitRefreshInterval()}
                onKeyDown={(e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                aria-label="自动刷新间隔（分钟）"
              />
            </div>
          </section>

          <section class="rounded-2xl border border-border/50 bg-card p-6">
            <h3 class="text-sm font-semibold">实验功能</h3>
            <p class="mt-1 text-xs text-muted-foreground">
              默认关闭。列表与刷新始终以本地 RSS 为准；开启并登录后，仅在滚到底时单向补云端更早历史。
              不同步已读/收藏、不上传本地订阅。依赖 Folo 非公开后端契约，可能随时失效；会话 token 仅保存在本机。
            </p>
            <div class="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <div>
                <div class="text-sm">Folo 账号登录与云补历史</div>
                <div class="text-xs text-muted-foreground">
                  {config()?.foloCloudAccountEnabled
                    ? '已开启：可登录后在列表滚到底时补更早历史，并可单向拉取云订阅到本地 sub_*'
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
                      本地优先：刷新只拉本地 RSS。云端仅用于滚到底补历史，以及把带 URL 的 feed 单向写入本地
                      `sub_*`；不上传本地订阅，也不同步已读/收藏。
                    </p>
                  </div>
                </Show>
              </div>
            </Show>
          </section>
        </div>
      </div>
    </section>
  );
}
