import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextFieldBareTextArea } from '@/components/shared/AppTextField';
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

export function BiliAccountBar() {
  const hub = getBiliHubState();
  const [pasteOpen, setPasteOpen] = createSignal(false);
  const [paste, setPaste] = createSignal('');
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

  onCleanup(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  const startQr = async () => {
    setBusy(true);
    try {
      if (pollTimer) clearInterval(pollTimer);
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
          if (pollTimer) clearInterval(pollTimer);
          setQrUrl('');
          setQrImg('');
          if (r.cookies) {
            showAppToast({ title: '登录成功', variant: 'success' });
            await refreshUser();
          }
        }
      }, 1500);
    } catch (e) {
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
      showAppToast({ title: 'Cookie 已保存', variant: 'success' });
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
            onClick={() => setPasteOpen(!pasteOpen())}
          >
            粘贴 Cookie
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
      <Show when={qrUrl()}>
        <div class="flex items-start gap-3 rounded-md border border-border/60 p-3 text-sm">
          <Show when={qrImg()}>
            <img src={qrImg()} alt="登录二维码" class="h-[160px] w-[160px] rounded bg-white p-1" />
          </Show>
          <div class="min-w-0 flex-1">
            <div class="mb-1 text-muted-foreground">{qrMsg()}</div>
            <div class="break-all text-xs text-muted-foreground">{qrUrl()}</div>
          </div>
        </div>
      </Show>
      <Show when={pasteOpen()}>
        <div class="flex flex-col gap-2">
          <AppTextFieldBareTextArea
            value={paste()}
            onInput={(e) => setPaste(e.currentTarget.value)}
            placeholder="粘贴包含 SESSDATA 的 Cookie 字符串"
            class="min-h-[80px] w-full"
          />
          <Button size="sm" disabled={busy()} onClick={() => void applyPaste()}>
            保存 Cookie
          </Button>
        </div>
      </Show>
    </div>
  );
}
