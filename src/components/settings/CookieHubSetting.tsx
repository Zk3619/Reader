/**
 * 主程序设置 · Cookie Hub：平台 Cookie 展示 / 清除，以及扫码、Cookie、WebView 登录。
 * 书源 Cookie 仍按 bookSourceUrl 隔离，不在此合并。
 */

import {
  For,
  Show,
  createResource,
  createSignal,
  onCleanup,
  type Component,
} from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import {
  clearPlatformCookies,
  describeCookieSource,
  makeDoubanScope,
  makeSubscribeScope,
  resolveSharedCookies,
  resolveSiteCookies,
  warmCookieHub,
  type SharedPlatform,
} from '@/lib/cookie-hub';
import {
  cookiesFromManualInput,
  openPlatformLogin,
  persistBiliQrCookies,
  persistNeteaseQrCookies,
  type PlatformId,
} from '@/lib/media/auth';
import { setPlatformCredential } from '@/lib/media/auth/platform-credentials';
import {
  checkNeteaseQrLogin,
  createNeteaseQrLoginSession,
  describeNeteaseQrStatus,
  type NeteaseQrLoginSession,
} from '@/lib/media/audio/platform/auth/netease-qr-login';
import {
  checkBiliQrLogin,
  createBiliQrLoginSession,
  describeBiliQrStatus,
  type BiliQrLoginSession,
} from '@/lib/media/audio/platform/auth/bili-qr-login';
import { maybeSyncPlatformPlaylistsAfterLogin } from '@/lib/media/audio/platform/playlist-sync';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { renderQrDataUrl } from '@/lib/qr/render-qrcode';
import { appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';

const PLATFORMS: Array<{ id: SharedPlatform; label: string }> = [
  { id: 'netease', label: '网易云' },
  { id: 'bili', label: 'B 站' },
  { id: 'ytm', label: 'YouTube Music' },
];

const QR_PLATFORMS = new Set<SharedPlatform>(['netease', 'bili']);
const QR_POLL_MS = 2000;

type QrLoginSession =
  | { platform: 'netease'; session: NeteaseQrLoginSession }
  | { platform: 'bili'; session: BiliQrLoginSession };

function cookieHasCfClearance(cookies: string): boolean {
  return /(?:^|;\s*)cf_clearance=/i.test(cookies.trim());
}

function previewCookies(cookies: string): string {
  const t = cookies.trim();
  if (!t) return '（空）';
  if (t.length <= 64) return t;
  return `${t.slice(0, 48)}…(${t.length} chars)`;
}

function platformLabel(p: SharedPlatform): string {
  return PLATFORMS.find((x) => x.id === p)?.label ?? p;
}

export const CookieHubSetting: Component = () => {
  const [tick, setTick] = createSignal(0);
  const [loginPlatform, setLoginPlatform] = createSignal<SharedPlatform | null>(null);
  const [qrOpen, setQrOpen] = createSignal(false);
  const [cookieOpen, setCookieOpen] = createSignal(false);
  const [cookieInput, setCookieInput] = createSignal('');
  const [qrDataUrl, setQrDataUrl] = createSignal<string | null>(null);
  const [qrStatus, setQrStatus] = createSignal('');
  const [qrBusy, setQrBusy] = createSignal(false);
  const [webBusy, setWebBusy] = createSignal(false);
  const [cookieBusy, setCookieBusy] = createSignal(false);

  let qrSession: QrLoginSession | null = null;
  let qrPollTimer: ReturnType<typeof setTimeout> | null = null;
  let qrStopped = false;

  const [rows] = createResource(
    () => tick(),
    async () => {
      await warmCookieHub();
      const platforms = await Promise.all(
        PLATFORMS.map(async (p) => {
          const resolved = await resolveSharedCookies(p.id);
          return {
            kind: 'platform' as const,
            id: p.id,
            label: p.label,
            cookies: resolved.cookies,
            source: resolved.source,
            sourceLabel: describeCookieSource(resolved.source),
            hasCf: cookieHasCfClearance(resolved.cookies),
            healthy: resolved.healthy,
          };
        }),
      );

      const subscribeScope = makeSubscribeScope('https://rsshub.app/');
      const doubanScope = makeDoubanScope();
      const sites = [
        {
          kind: 'site' as const,
          id: subscribeScope.scopeKey,
          label: '订阅 · rsshub.app',
          cookies: resolveSiteCookies(subscribeScope, 'https://rsshub.app/').cookies,
          source: resolveSiteCookies(subscribeScope, 'https://rsshub.app/').source,
          sourceLabel: describeCookieSource(
            resolveSiteCookies(subscribeScope, 'https://rsshub.app/').source,
          ),
          hasCf: cookieHasCfClearance(
            resolveSiteCookies(subscribeScope, 'https://rsshub.app/').cookies,
          ),
        },
        {
          kind: 'site' as const,
          id: doubanScope.scopeKey,
          label: '影视 · 豆瓣 danmu',
          cookies: resolveSiteCookies(doubanScope, 'https://www.douban.com/').cookies,
          source: resolveSiteCookies(doubanScope, 'https://www.douban.com/').source,
          sourceLabel: describeCookieSource(
            resolveSiteCookies(doubanScope, 'https://www.douban.com/').source,
          ),
          hasCf: cookieHasCfClearance(
            resolveSiteCookies(doubanScope, 'https://www.douban.com/').cookies,
          ),
        },
      ];

      return { platforms, sites };
    },
  );

  function refreshHub(): void {
    setTick((n) => n + 1);
  }

  async function afterLoginSuccess(platform: PlatformId): Promise<void> {
    refreshHub();
    if (!getMusicSettings().platformPlaylistSyncAfterLogin) return;
    try {
      const result = await maybeSyncPlatformPlaylistsAfterLogin(platform);
      if (result && result.total > 0) {
        showAppToast({
          title: '已自动同步歌单到「我的列表」',
          description: `新建 ${result.created}，更新 ${result.updated}${
            result.failed > 0 ? `，失败 ${result.failed}` : ''
          }`,
          variant: result.failed > 0 ? 'warning' : 'success',
        });
      }
    } catch (e) {
      showAppToast({
        title: '自动同步失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  }

  async function clearOne(platform: SharedPlatform): Promise<void> {
    await clearPlatformCookies(platform);
    refreshHub();
    showAppToast({ title: `已清除 ${platformLabel(platform)} Cookie` });
  }

  function stopQrPoll(): void {
    qrStopped = true;
    if (qrPollTimer != null) {
      clearTimeout(qrPollTimer);
      qrPollTimer = null;
    }
    qrSession = null;
  }

  function scheduleQrPoll(): void {
    if (qrStopped || !qrSession) return;
    qrPollTimer = setTimeout(() => {
      void pollQrOnce();
    }, QR_POLL_MS);
  }

  async function pollQrOnce(): Promise<void> {
    const wrapped = qrSession;
    if (!wrapped || qrStopped) return;
    try {
      if (wrapped.platform === 'netease') {
        const result = await checkNeteaseQrLogin(wrapped.session);
        if (qrStopped || qrSession !== wrapped) return;
        setQrStatus(describeNeteaseQrStatus(result.code) || result.message);
        if (result.code === 803 && result.cookies) {
          stopQrPoll();
          await persistNeteaseQrCookies(result.cookies);
          setQrBusy(false);
          setQrDataUrl(null);
          setQrOpen(false);
          showAppToast({ title: '网易云登录成功', variant: 'success' });
          void afterLoginSuccess('netease');
          return;
        }
        if (result.code === 800) {
          stopQrPoll();
          setQrBusy(false);
          setQrStatus('二维码已过期，请刷新');
          return;
        }
        scheduleQrPoll();
        return;
      }

      const result = await checkBiliQrLogin(wrapped.session);
      if (qrStopped || qrSession !== wrapped) return;
      setQrStatus(describeBiliQrStatus(result.code) || result.message);
      if (result.code === 0 && result.cookies) {
        stopQrPoll();
        await persistBiliQrCookies(result.cookies);
        setQrBusy(false);
        setQrDataUrl(null);
        setQrOpen(false);
        showAppToast({ title: '哔哩哔哩登录成功', variant: 'success' });
        void afterLoginSuccess('bili');
        return;
      }
      if (result.code === 86038) {
        stopQrPoll();
        setQrBusy(false);
        setQrStatus('二维码已过期，请刷新');
        return;
      }
      if (result.code !== 86101 && result.code !== 86090) {
        stopQrPoll();
        setQrBusy(false);
        setQrStatus(result.message || `扫码失败 (code=${result.code})`);
        return;
      }
      scheduleQrPoll();
    } catch (e) {
      if (qrStopped) return;
      setQrStatus(e instanceof Error ? e.message : String(e));
      scheduleQrPoll();
    }
  }

  async function startQrLogin(platform: SharedPlatform): Promise<void> {
    if (!QR_PLATFORMS.has(platform)) return;
    stopQrPoll();
    qrStopped = false;
    setLoginPlatform(platform);
    setQrBusy(true);
    setQrStatus('正在生成二维码…');
    setQrDataUrl(null);
    setQrOpen(true);
    try {
      if (platform === 'netease') {
        const session = await createNeteaseQrLoginSession();
        if (qrStopped) return;
        qrSession = { platform: 'netease', session };
        const dataUrl = await renderQrDataUrl(session.qrContent, 240);
        if (qrStopped) return;
        setQrDataUrl(dataUrl);
        setQrStatus(describeNeteaseQrStatus(801));
      } else {
        const session = await createBiliQrLoginSession();
        if (qrStopped) return;
        qrSession = { platform: 'bili', session };
        const dataUrl = await renderQrDataUrl(session.qrContent, 240);
        if (qrStopped) return;
        setQrDataUrl(dataUrl);
        setQrStatus(describeBiliQrStatus(86101));
      }
      scheduleQrPoll();
    } catch (e) {
      stopQrPoll();
      setQrBusy(false);
      setQrDataUrl(null);
      const msg = e instanceof Error ? e.message : String(e);
      setQrStatus(msg);
      showAppToast({
        title: '扫码登录失败',
        description: msg,
        variant: 'destructive',
      });
    }
  }

  function handleQrOpenChange(open: boolean): void {
    setQrOpen(open);
    if (!open) {
      stopQrPoll();
      setQrBusy(false);
      setQrDataUrl(null);
      setQrStatus('');
    }
  }

  async function handleWebViewLogin(platform: SharedPlatform): Promise<void> {
    setWebBusy(true);
    setLoginPlatform(platform);
    try {
      const cookies = await openPlatformLogin(platform);
      if (cookies?.trim()) {
        showAppToast({ title: '登录 Cookie 已同步', variant: 'success' });
        void afterLoginSuccess(platform);
      }
    } catch (e) {
      showAppToast({
        title: 'WebView 登录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setWebBusy(false);
    }
  }

  function openCookieLogin(platform: SharedPlatform): void {
    setLoginPlatform(platform);
    setCookieInput('');
    setCookieOpen(true);
  }

  async function submitCookieLogin(): Promise<void> {
    const platform = loginPlatform();
    if (!platform || cookieBusy()) return;
    setCookieBusy(true);
    try {
      await setPlatformCredential({
        platform,
        cookies: cookiesFromManualInput(cookieInput()),
        healthy: true,
      });
      setCookieOpen(false);
      setCookieInput('');
      showAppToast({ title: `${platformLabel(platform)} Cookie 登录成功`, variant: 'success' });
      void afterLoginSuccess(platform);
    } catch (e) {
      showAppToast({
        title: 'Cookie 登录失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setCookieBusy(false);
    }
  }

  onCleanup(() => {
    stopQrPoll();
  });

  return (
    <div class="rounded-2xl border border-border/50 bg-card p-6">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-2">
          <div>
            <h3 class="font-semibold text-foreground">Cookie Hub</h3>
            <p class="text-sm text-muted-foreground">
              平台账号 Cookie 的统一入口：一处登录，音乐 / 影视 / 下载共用。书源 Cookie 仍按书源
              URL 隔离，不在此合并。
            </p>
          </div>
          <ul class="list-inside list-disc space-y-1 text-xs text-muted-foreground">
            <li>
              <span class="text-foreground/90">音乐</span>
              ：网易云 / B 站 / YouTube Music 搜播与歌单同步读取此处登录态
            </li>
            <li>
              <span class="text-foreground/90">影视</span>
              ：B 站弹幕等请求复用 B 站 Cookie，无需在影视设置中再填
            </li>
            <li>
              <span class="text-foreground/90">下载</span>
              ：哔哩下载页可扫码或 Cookie 登录，结果同步回本 Hub；亦可在此登录后直接使用
            </li>
            <li>
              登录方式：扫码（网易云 / B 站）、Cookie 登录弹窗、WebView 登录；「清除」仅移除 Hub
              中该平台状态
            </li>
          </ul>
        </div>
        <Button size="sm" variant="outline" class="shrink-0" onClick={() => refreshHub()}>
          刷新
        </Button>
      </div>

      <Show when={rows.error}>
        <p class="mb-3 text-sm text-destructive">加载失败：{String(rows.error)}</p>
      </Show>

      <div class="space-y-3">
        <div class="text-xs font-medium text-muted-foreground">平台 Cookie</div>
        <For each={rows()?.platforms ?? []}>
          {(row) => (
            <div class="space-y-2 rounded-lg border border-border/60 px-3 py-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span>{row.label}</span>
                    <span
                      class={
                        row.healthy ? 'text-xs text-primary' : 'text-xs text-muted-foreground'
                      }
                    >
                      {row.healthy ? '已登录' : '未登录'}
                    </span>
                    <span class="text-xs text-muted-foreground">{row.sourceLabel}</span>
                    <Show when={row.hasCf}>
                      <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                        cf_clearance
                      </span>
                    </Show>
                  </div>
                  <div class="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {previewCookies(row.cookies)}
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <Show when={QR_PLATFORMS.has(row.id)}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={qrBusy() && qrOpen() && loginPlatform() === row.id}
                    onClick={() => void startQrLogin(row.id)}
                  >
                    扫码登录
                  </Button>
                </Show>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openCookieLogin(row.id)}
                >
                  Cookie 登录
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={webBusy() && loginPlatform() === row.id}
                  onClick={() => void handleWebViewLogin(row.id)}
                >
                  WebView 登录
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void clearOne(row.id)}
                >
                  清除
                </Button>
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="mt-5 space-y-2">
        <div class="text-xs font-medium text-muted-foreground">站点 SiteScope（样例）</div>
        <For each={rows()?.sites ?? []}>
          {(row) => (
            <div class="rounded-lg border border-border/60 px-3 py-2 text-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">{row.label}</div>
                <div class="flex items-center gap-2">
                  <span class="text-muted-foreground">{row.sourceLabel}</span>
                  <Show when={row.hasCf}>
                    <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                      cf_clearance
                    </span>
                  </Show>
                </div>
              </div>
              <div class="mt-1 truncate font-mono text-[11px] text-muted-foreground">{row.id}</div>
              <div class="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {previewCookies(row.cookies)}
              </div>
            </div>
          )}
        </For>
      </div>

      <AppDialog open={qrOpen()} onOpenChange={handleQrOpenChange} modal>
        <AppDialogContent portalToBody class="sm:max-w-md">
          <AppDialogHeader>
            <AppDialogTitle>
              扫码登录
              <Show when={loginPlatform()}>
                {' '}
                — {platformLabel(loginPlatform()!)}
              </Show>
            </AppDialogTitle>
            <AppDialogDescription>
              {loginPlatform() === 'bili'
                ? '请使用哔哩哔哩 App 扫描二维码完成登录。'
                : '请使用网易云 App 扫描二维码完成登录。'}
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY3}>
            <div class="flex flex-col items-center gap-3 py-1">
              <Show
                when={qrDataUrl()}
                fallback={
                  <div class="flex h-40 w-40 items-center justify-center rounded border border-border/60 text-xs text-muted-foreground">
                    {qrBusy() ? '生成中…' : '暂无二维码'}
                  </div>
                }
              >
                {(url) => (
                  <img
                    src={url()}
                    alt="登录二维码"
                    class="h-auto w-[min(240px,70vw)] rounded-md border border-border bg-white p-2"
                  />
                )}
              </Show>
              <Show when={qrStatus()}>
                <p class="text-center text-sm text-muted-foreground">{qrStatus()}</p>
              </Show>
            </div>
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button
              size="sm"
              variant="outline"
              disabled={qrBusy() && Boolean(qrDataUrl())}
              onClick={() => {
                const p = loginPlatform();
                if (p) void startQrLogin(p);
              }}
            >
              刷新二维码
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleQrOpenChange(false)}>
              关闭
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={cookieOpen()} onOpenChange={setCookieOpen} modal>
        <AppDialogContent portalToBody class="sm:max-w-md">
          <AppDialogHeader>
            <AppDialogTitle>
              Cookie 登录
              <Show when={loginPlatform()}>
                {' '}
                — {platformLabel(loginPlatform()!)}
              </Show>
            </AppDialogTitle>
            <AppDialogDescription>
              粘贴浏览器或抓包得到的 Cookie 字符串完成登录，写入 Cookie Hub 供各模块共享。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY3}>
            <AppTextFieldBareTextArea
              fieldClass="px-0.5"
              value={cookieInput()}
              onInput={(e) => setCookieInput(e.currentTarget.value)}
              placeholder={
                loginPlatform() === 'bili'
                  ? '粘贴包含 SESSDATA 的 Cookie'
                  : loginPlatform() === 'netease'
                    ? '粘贴包含 MUSIC_U 的 Cookie'
                    : '粘贴平台 Cookie'
              }
              class="min-h-30 w-full text-xs"
              rows={6}
            />
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setCookieOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              disabled={cookieBusy() || !cookieInput().trim()}
              onClick={() => void submitCookieLogin()}
            >
              {cookieBusy() ? '登录中…' : '登录'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
};
