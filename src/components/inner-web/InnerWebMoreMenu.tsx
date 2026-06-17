import { appDialogScrollBodyMaxH60 } from '@/lib/ui/viewport-classes';
/**
 * 内嵌页「更多」菜单（对齐 Legado WebViewActivity 溢出菜单）
 */

import { createSignal, createEffect, Show, onMount, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import {
  AppDialogScrollBody,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { MoreIcon, GlobeIcon, LinkIcon, CookieIcon, LoaderIcon } from '@/components/shared/icons';
import { readInnerWebCookies } from '@/lib/platform/inner-web';
import {
  createInnerWebDialogOpenChange,
  createInnerWebMenuOpenChange,
  INNER_WEB_OVERLAY_Z,
} from '@/lib/platform/inner-web-panel-overlay';
import { openUrlInBrowser } from '@/lib/platform/open-url';
import { showAppToast } from '@/components/shared/AppToasts';
import { ACCESSIBILITY_EVENTS } from '@/utils/accessibility';

export interface InnerWebMoreMenuProps {
  pageUrl?: string;
  cookieSyncUrl?: string;
}

export function InnerWebMoreMenu(props: InnerWebMoreMenuProps) {
  const [open, setOpen] = createSignal(false);
  const [cookieDialogOpen, setCookieDialogOpen] = createSignal(false);
  const [cookieText, setCookieText] = createSignal('');
  const [cookieLoading, setCookieLoading] = createSignal(false);

  const httpUrl = () => {
    const u = props.pageUrl?.trim() ?? '';
    return u.startsWith('http://') || u.startsWith('https://') ? u : '';
  };

  const showMenu = () => Boolean(httpUrl());

  const handleMenuOpenChange = createInnerWebMenuOpenChange(setOpen, props.pageUrl);
  const handleCookieDialogOpenChange = createInnerWebDialogOpenChange(
    setCookieDialogOpen,
    props.pageUrl
  );

  createEffect(() => {
    if (!cookieDialogOpen()) {
      setCookieLoading(false);
      setCookieText('');
    }
  });

  onMount(() => {
    const onDialogOpened = () => {
      if (open()) handleMenuOpenChange(false);
    };
    window.addEventListener(ACCESSIBILITY_EVENTS.DIALOG_OPENED, onDialogOpened);
    onCleanup(() =>
      window.removeEventListener(ACCESSIBILITY_EVENTS.DIALOG_OPENED, onDialogOpened),
    );
  });

  const handleOpenInBrowser = () => {
    handleMenuOpenChange(false);
    const url = httpUrl();
    if (url) void openUrlInBrowser(url);
  };

  const handleCopyUrl = async () => {
    handleMenuOpenChange(false);
    const url = httpUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showAppToast({ title: '已复制链接', variant: 'default' });
    } catch {
      showAppToast({ title: '复制失败', variant: 'destructive' });
    }
  };

  const handleViewCookie = () => {
    const url = (props.cookieSyncUrl?.trim() || httpUrl()).trim();
    if (!url.startsWith('http')) {
      showAppToast({ title: '无法读取 Cookie', description: '当前页面无有效 URL', variant: 'default' });
      return;
    }
    setCookieText('');
    setCookieLoading(true);
    // 先 retain 并打开弹窗，再关菜单，避免「关菜单 immediate 恢复子 WebView → 读 Cookie → 再开弹窗」之间 WebView 盖住 Dialog
    handleCookieDialogOpenChange(true);
    handleMenuOpenChange(false);

    void (async () => {
      try {
        const cookies = await readInnerWebCookies(url);
        setCookieText(cookies || '（空）');
      } catch (e) {
        console.error('[InnerWebMoreMenu] readInnerWebCookies failed', e);
        setCookieText('读取 Cookie 失败');
        showAppToast({ title: '读取失败', description: String(e), variant: 'destructive' });
      } finally {
        setCookieLoading(false);
      }
    })();
  };

  return (
    <Show when={showMenu()}>
      <AppDropdownMenu placement="top-end" open={open()} onOpenChange={handleMenuOpenChange}>
        <AppDropdownMenuTrigger
          as={(triggerProps: Record<string, unknown>) => (
            <AppDropdownMenuIconTrigger
              triggerProps={triggerProps}
              class="no-drag h-9 w-9"
              aria-label="更多"
            >
              <MoreIcon class="h-4 w-4" />
            </AppDropdownMenuIconTrigger>
          )}
        />
        <AppDropdownMenuContent layout="min" portalZClass={INNER_WEB_OVERLAY_Z}>
          <AppDropdownMenuItem onSelect={handleOpenInBrowser}>
            <GlobeIcon class="h-4 w-4" />
            <span>在浏览器中打开</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => void handleCopyUrl()}>
            <LinkIcon class="h-4 w-4" />
            <span>复制链接</span>
          </AppDropdownMenuItem>
          <AppDropdownMenuItem onSelect={() => void handleViewCookie()}>
            <CookieIcon class="h-4 w-4" />
            <span>查看 Cookie</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>

      <AppDialog open={cookieDialogOpen()} onOpenChange={handleCookieDialogOpenChange}>
        <AppDialogContent portalZClass={INNER_WEB_OVERLAY_Z}>
          <AppDialogHeader>
            <AppDialogTitle>Cookie</AppDialogTitle>
            <AppDialogDescription class="sr-only">当前页面 Cookie 字符串</AppDialogDescription>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodyMaxH60}>
            <Show
              when={!cookieLoading()}
              fallback={
                <div class="flex min-h-24 items-center justify-center">
                  <LoaderIcon class="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <pre class="break-all whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {cookieText()}
              </pre>
            </Show>
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => handleCookieDialogOpenChange(false)}>
              关闭
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </Show>
  );
}
