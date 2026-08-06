import { Show, createSignal, onCleanup, onMount } from 'solid-js';
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
  applyPastedCookies,
  ensureDeviceCookies,
  fetchBiliUserProfile,
  logoutBili,
  pollQrLogin,
  startQrLogin,
  syncBiliSessionFromHub,
  activateCookies,
} from '@/lib/download/bili/session';
import { renderQrDataUrl } from '@/lib/qr/render-qrcode';
import { getBiliHubState, setBiliUser } from '@/stores/download-bili/hub';
import { appDialogScrollBodySpaceY3 } from '@/lib/ui/viewport-classes';

export function BiliAccountBar() {
  const hub = getBiliHubState();
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [paste, setPaste] = createSignal('');
  const [qrOpen, setQrOpen] = createSignal(false);
  const [qrUrl, setQrUrl] = createSignal('');
  const [qrImg, setQrImg] = createSignal('');
  const [qrMsg, setQrMsg] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const refreshUser = async () => {
    try {
      await syncBiliSessionFromHub();
      const profile = await fetchBiliUserProfile();
      setBiliUser(profile);
    } catch (e) {
      console.warn(e);
    }
  };

  onMount(() => {
    void (async () => {
      try {
        await ensureDeviceCookies();
        await activateCookies();
        await refreshUser();
      } catch (e) {
        console.warn('[bili] session init', e);
      }
    })();
  });

  const stopQrPoll = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    setQrUrl('');
    setQrImg('');
    setQrMsg('');
  };

  onCleanup(() => {
    stopQrPoll();
  });

  const handleQrOpenChange = (open: boolean) => {
    setQrOpen(open);
    if (!open) stopQrPoll();
  };

  const startQr = async () => {
    setBusy(true);
    setQrOpen(true);
    try {
      stopQrPoll();
      const session = await startQrLogin();
      setQrUrl(session.qrContent);
      try {
        setQrImg(await renderQrDataUrl(session.qrContent, 200));
      } catch {
        setQrImg('');
      }
      setQrMsg('请使用哔哩哔哩 App 扫码');
      pollTimer = setInterval(async () => {
        const r = await pollQrLogin(session);
        setQrMsg(r.message);
        if (r.done) {
          stopQrPoll();
          setQrOpen(false);
          if (r.cookies) {
            showAppToast({ title: '登录成功', variant: 'success' });
            await refreshUser();
          }
        }
      }, 1500);
    } catch (e) {
      setQrOpen(false);
      showAppToast({
        title: e instanceof Error ? e.message : '扫码失败',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const applyPaste = async () => {
    setBusy(true);
    try {
      await applyPastedCookies(paste());
      setPasteOpen(false);
      setPaste('');
      await refreshUser();
      showAppToast({ title: 'Cookie 登录成功', variant: 'success' });
    } catch (e) {
      showAppToast({
        title: e instanceof Error ? e.message : 'Cookie 无效',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await logoutBili();
    setBiliUser(null);
    await refreshUser();
    showAppToast({ title: '已退出登录', variant: 'success' });
  };

  return (
    <div class="flex flex-col gap-2 border-b border-border/60 pb-3">
      <div class="flex flex-wrap items-center gap-2">
        <Show
          when={hub.user?.isLogin}
          fallback={
            <span class="text-sm text-muted-foreground">
              未登录（清晰度受限；来源 {hub.user?.cookieSource || 'none'}）
            </span>
          }
        >
          <div class="flex items-center gap-2">
            <Show when={hub.user?.avatar}>
              <img
                src={hub.user!.avatar}
                alt=""
                class="h-7 w-7 rounded-full object-cover"
              />
            </Show>
            <span class="text-sm font-medium">{hub.user?.name}</span>
            <span class="text-xs text-muted-foreground">
              Lv{hub.user?.level ?? '-'} · {hub.user?.cookieSource}
            </span>
          </div>
        </Show>
        <div class="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={busy()} onClick={() => void startQr()}>
            扫码登录
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPaste('');
              setPasteOpen(true);
            }}
          >
            Cookie 登录
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refreshUser()}>
            刷新
          </Button>
          <Show when={hub.user?.isLogin}>
            <Button size="sm" variant="ghost" onClick={() => void logout()}>
              退出
            </Button>
          </Show>
        </div>
      </div>

      <AppDialog open={qrOpen()} onOpenChange={handleQrOpenChange} modal>
        <AppDialogContent portalToBody class="sm:max-w-md">
          <AppDialogHeader>
            <AppDialogTitle>扫码登录</AppDialogTitle>
            <AppDialogDescription>请使用哔哩哔哩 App 扫描二维码完成登录。</AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY3}>
            <div class="flex flex-col items-center gap-3 py-1">
              <Show
                when={qrImg()}
                fallback={
                  <div class="flex h-40 w-40 items-center justify-center rounded border border-border/60 text-xs text-muted-foreground">
                    {busy() ? '生成中…' : '暂无二维码'}
                  </div>
                }
              >
                <img
                  src={qrImg()}
                  alt="登录二维码"
                  class="h-40 w-40 rounded bg-white p-1"
                />
              </Show>
              <Show when={qrMsg()}>
                <p class="text-center text-sm text-muted-foreground">{qrMsg()}</p>
              </Show>
              <Show when={qrUrl()}>
                <p class="break-all text-center text-xs text-muted-foreground">{qrUrl()}</p>
              </Show>
            </div>
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button
              size="sm"
              variant="outline"
              disabled={busy()}
              onClick={() => void startQr()}
            >
              刷新二维码
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleQrOpenChange(false)}>
              关闭
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <AppDialog open={pasteOpen()} onOpenChange={setPasteOpen} modal>
        <AppDialogContent portalToBody class="sm:max-w-md">
          <AppDialogHeader>
            <AppDialogTitle>Cookie 登录</AppDialogTitle>
            <AppDialogDescription>
              粘贴包含 SESSDATA 的 Cookie 字符串以登录哔哩哔哩账号。
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY3}>
            <AppTextFieldBareTextArea
              value={paste()}
              onInput={(e) => setPaste(e.currentTarget.value)}
              placeholder="粘贴包含 SESSDATA 的 Cookie 字符串"
              class="min-h-25 w-full text-xs"
              rows={5}
            />
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}>
              取消
            </Button>
            <Button size="sm" disabled={busy() || !paste().trim()} onClick={() => void applyPaste()}>
              {busy() ? '登录中…' : '登录'}
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </div>
  );
}
