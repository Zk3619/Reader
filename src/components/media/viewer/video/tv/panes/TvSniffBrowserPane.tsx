/**
 * E5：内置嗅探浏览器（iframe + 注入脚本）
 */

import { createSignal, For, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { Label } from '@/components/ui/label';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import {
  buildSniffInjectScript,
  detectSniffUrlsFromText,
  loadSniffHistory,
  pushSniffHistory,
  type SniffHit,
} from '@/lib/media/video/sniff/browser-sniff';
import { openInExternalPlayer, getPreferredExternalPlayer } from '@/lib/media/tv/play/external-player';
import { showAppToast } from '@/components/shared/AppToasts';
import { resolvePlaybackEngine } from '@/lib/media/video/playback/router';

const CHANNEL = 'reader-video-sniff';

export function TvSniffBrowserPane() {
  const [url, setUrl] = createSignal('https://');
  const [frameSrc, setFrameSrc] = createSignal('');
  const [hits, setHits] = createSignal<SniffHit[]>([]);
  const [history, setHistory] = createSignal(loadSniffHistory());

  const onMessage = (ev: MessageEvent) => {
    const d = ev.data as { channel?: string; url?: string };
    if (d?.channel !== CHANNEL || !d.url) return;
    const hit: SniffHit = {
      url: d.url,
      kind: detectSniffUrlsFromText(d.url)[0]?.kind ?? 'other',
    };
    setHits((prev) => {
      if (prev.some((x) => x.url === hit.url)) return prev;
      return [hit, ...prev].slice(0, 40);
    });
  };

  window.addEventListener('message', onMessage);
  onCleanup(() => window.removeEventListener('message', onMessage));

  const navigate = () => {
    const u = url().trim();
    if (!/^https?:\/\//i.test(u)) {
      showAppToast({ title: '请输入 http(s) URL' });
      return;
    }
    setFrameSrc(u);
    setHits([]);
  };

  const playHit = async (hit: SniffHit) => {
    pushSniffHistory(hit.url);
    setHistory(loadSniffHistory());
    const engine = resolvePlaybackEngine({ url: hit.url, sourceKind: 'sniff' });
    try {
      await openInExternalPlayer(hit.url, getPreferredExternalPlayer());
      showAppToast({
        title: '已交播放',
        description: `${engine} / ${hit.kind}`,
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
        <div class="flex gap-2">
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
            前往
          </Button>
        </div>
        <p class="text-[11px] text-muted-foreground">
          跨域页面可能无法注入嗅探；也可粘贴 HTML/日志到下方解析。注入脚本仅作辅助：
          <code class="mx-1">{buildSniffInjectScript(CHANNEL).slice(0, 24)}…</code>
        </p>
        <div class="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[1fr_280px]">
          <iframe
            title="video-sniff"
            class="min-h-[240px] w-full rounded-md border border-border bg-background"
            src={frameSrc() || 'about:blank'}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          <div class="flex min-h-0 flex-col gap-2 overflow-auto">
            <h3 class="text-sm font-semibold">嗅探结果</h3>
            <For each={hits()}>
              {(h) => (
                <button
                  type="button"
                  class="rounded-md border border-border px-2 py-1 text-left text-xs hover:bg-muted"
                  onClick={() => void playHit(h)}
                >
                  <span class="text-muted-foreground">[{h.kind}]</span> {h.url}
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
