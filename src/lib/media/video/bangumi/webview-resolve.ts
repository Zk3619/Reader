/**
 * WebView 抽流：桌面无头 WebView（对齐 Kazumi HeadlessWebview）
 * 不再打开可见「影视嗅探」窗，避免关窗后因重试反复弹窗。
 */

import { detectSniffUrlsFromText } from '@/lib/media/video/sniff/browser-sniff';
import { isAndroid, isTauri } from '@/lib/platform/detect';

/** 进程内互斥：同一时刻只跑一路抽流，避免关窗/超时后连环 reopen */
let sniffInFlight: Promise<string | null> | null = null;

export async function resolveViaWebViewSniff(
  pageUrl: string,
  timeoutMs = 45000,
): Promise<string | null> {
  if (!isTauri() || isAndroid()) {
    return null;
  }
  if (sniffInFlight) {
    return sniffInFlight;
  }

  sniffInFlight = (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const url = await invoke<string>('video_sniff_resolve_headless', {
        url: pageUrl,
        timeoutMs,
      });
      const hit = String(url || '').trim();
      return hit || null;
    } catch (e) {
      console.warn('[bangumi] headless webview sniff failed', e);
      return null;
    } finally {
      sniffInFlight = null;
    }
  })();

  return sniffInFlight;
}

export function pickBestSniffFromHtml(html: string): string | null {
  const hits = detectSniffUrlsFromText(html);
  if (!hits.length) return null;
  const prefer = hits.find((h) => h.kind === 'hls') || hits.find((h) => h.kind === 'mp4') || hits[0];
  return prefer?.url || null;
}
