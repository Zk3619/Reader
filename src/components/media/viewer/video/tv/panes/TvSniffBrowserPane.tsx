/**
 * E5 / E2.1c：内置嗅探（iframe 注入 + 独立 WebView 导航拦截）
 */

import { createSignal, For, onCleanup, onMount } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import {
  buildSniffInjectScript,
  classifyMediaUrl,
  detectSniffUrlsFromText,
  loadSniffHistory,
  pushSniffHistory,
  type SniffHit,
} from '@/lib/media/video/sniff/browser-sniff';
import { showAppToast } from '@/components/shared/AppToasts';
import { openRoutedPlayback } from '@/lib/media/video/playback/open-routed';
import { formatPlaybackToastDescription } from '@/lib/media/video/playback/mpv-launch';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const CHANNEL = 'reader-video-sniff';

export function TvSniffBrowserPane() {
  const [url, setUrl] = createSignal('https://');
  const [frameSrc, setFrameSrc] = createSignal('');
  const [hits, setHits] = createSignal<SniffHit[]>([]);
  const [history, setHistory] = createSignal(loadSniffHistory());
  const [paste, setPaste] = createSignal('');
  let iframeEl: HTMLIFrameElement | undefined;
  let unlisten: UnlistenFn | undefined;

  const pushHit = (raw: string, source?: string) => {
    const hit: SniffHit = {
      url: raw,
      kind: classifyMediaUrl(raw),
      source,
    };
    setHits((prev) => {
      if (prev.some((x) => x.url === hit.url)) return prev;
      return [hit, ...prev].slice(0, 40);
    });
  };

  const onMessage = (ev: MessageEvent) => {
    const d = ev.data as { channel?: string; url?: string; source?: string };
    if (d?.channel !== CHANNEL || !d.url) return;
    pushHit(d.url, d.source || 'iframe');
  };

  window.addEventListener('message', onMessage);
  onCleanup(() => window.removeEventListener('message', onMessage));

  onMount(() => {
    void listen<{ url?: string; source?: string }>('video-sniff-hit', (ev) => {
      if (ev.payload?.url) pushHit(ev.payload.url, ev.payload.source || 'nav');
    }).then((fn) => {
      unlisten = fn;
    });
  });
  onCleanup(() => {
    void unlisten?.();
  });

  const injectFrame = () => {
    try {
      const win = iframeEl?.contentWindow;
      if (!win) return;
      (win as unknown as { eval: (code: string) => unknown }).eval(
        buildSniffInjectScript(CHANNEL),
      );
    } catch {
      showAppToast({
        title: 'iframe 注入失败',
        description: '可能被 X-Frame-Options / CSP 拦截；请用「独立嗅探窗」',
      });
    }
  };

  const navigate = () => {
    const u = url().trim();
    if (!/^https?:\/\//i.test(u)) {
      showAppToast({ title: '请输入 http(s) URL' });
      return;
    }
    setFrameSrc(u);
    setHits([]);
  };

  const openNative = async () => {
    const u = url().trim();
    if (!/^https?:\/\//i.test(u)) {
      showAppToast({ title: '请输入 http(s) URL' });
      return;
    }
    try {
      await invoke('video_sniff_open_window', { url: u });
      showAppToast({
        title: '已打开独立嗅探窗',
        description: '导航到媒体 URL 时会回传命中；XFO 站点请用此窗',
      });
    } catch (e) {
      showAppToast({
        title: '独立嗅探窗失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const parsePaste = () => {
    const found = detectSniffUrlsFromText(paste());
    for (const h of found) pushHit(h.url, 'paste');
    if (!found.length) {
      showAppToast({ title: '未解析到媒体 URL' });
    }
  };

  const playHit = async (hit: SniffHit) => {
    pushSniffHistory(hit.url);
    setHistory(loadSniffHistory());
    try {
      const engine = await openRoutedPlayback(hit.url, {
        title: hit.kind,
        sourceKind: 'sniff',
      });
      showAppToast({
        title: '已交播放',
        description: formatPlaybackToastDescription(engine, hit.kind),
      });
    } catch (e) {
      showAppToast({
        title: '播放失败',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <TvHubPageShell section="sniff">
      <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-4">
        <div class="flex flex-wrap gap-2">
          <AppTextField class="min-w-0 flex-1">
            <Label class="sr-only">URL</Label>
            <AppTextFieldInput
              value={url()}
              onInput={(e: Event) =>
                setUrl((e.currentTarget as HTMLInputElement).value)
              }
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') navigate();
              }}
            />
          </AppTextField>
          <Button type="button" size="sm" onClick={navigate}>
            iframe 前往
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void openNative()}>
            独立嗅探窗
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={injectFrame}>
            注入脚本
          </Button>
        </div>
        <p class="text-[11px] text-muted-foreground">
          iframe 常被 XFO 拦截；独立窗监听导航 URL。也可粘贴 HTML/日志解析。
        </p>
        <div class="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[1fr_280px]">
          <div class="flex min-h-0 flex-col gap-2">
            <iframe
              ref={(el) => {
                iframeEl = el;
              }}
              title="video-sniff"
              class="min-h-[240px] w-full flex-1 rounded-md border border-border bg-background"
              src={frameSrc() || 'about:blank'}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => injectFrame()}
            />
            <AppTextField>
              <Label class="text-xs text-muted-foreground">粘贴文本解析</Label>
              <AppTextFieldInput
                value={paste()}
                onInput={(e: Event) =>
                  setPaste((e.currentTarget as HTMLInputElement).value)
                }
                placeholder="HTML / 日志 / 含 m3u8 的文本"
              />
            </AppTextField>
            <Button type="button" size="sm" variant="outline" onClick={parsePaste}>
              解析粘贴
            </Button>
          </div>
          <div class="flex min-h-0 flex-col gap-2 overflow-auto">
            <h3 class="text-sm font-semibold">嗅探结果</h3>
            <For each={hits()}>
              {(h) => (
                <button
                  type="button"
                  class="rounded-md border border-border px-2 py-1 text-left text-xs hover:bg-muted"
                  onClick={() => void playHit(h)}
                >
                  <span class="text-muted-foreground">
                    [{h.kind}
                    {h.source ? `/${h.source}` : ''}]
                  </span>{' '}
                  {h.url}
                </button>
              )}
            </For>
            <h3 class="mt-2 text-sm font-semibold">历史</h3>
            <For each={history()}>
              {(u) => (
                <button
                  type="button"
                  class="truncate text-left text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void playHit({ url: u, kind: 'other' })}
                >
                  {u}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </TvHubPageShell>
  );
}
