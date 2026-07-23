/**
 * WebView 抽流：监听 video-sniff-hit / 超时
 */

import { detectSniffUrlsFromText } from '@/lib/media/video/sniff/browser-sniff';
import { isAndroid, isTauri } from '@/lib/platform/detect';

export async function resolveViaWebViewSniff(
  pageUrl: string,
  timeoutMs = 20000,
): Promise<string | null> {
  if (!isTauri() || isAndroid()) {
    return null;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let unlisten: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unlisten?.();
      resolve(null);
    }, timeoutMs);

    void (async () => {
      try {
        unlisten = await listen<{ url?: string }>('video-sniff-hit', (ev) => {
          const u = String(ev.payload?.url || '').trim();
          if (!u || settled) return;
          settled = true;
          window.clearTimeout(timer);
          unlisten?.();
          resolve(u);
        });
        await invoke('video_sniff_open_window', { url: pageUrl });
      } catch (e) {
        console.warn('[bangumi] webview sniff failed', e);
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          unlisten?.();
          resolve(null);
        }
      }
    })();
  });
}

export function pickBestSniffFromHtml(html: string): string | null {
  const hits = detectSniffUrlsFromText(html);
  if (!hits.length) return null;
  const prefer = hits.find((h) => h.kind === 'hls') || hits.find((h) => h.kind === 'mp4') || hits[0];
  return prefer?.url || null;
}
