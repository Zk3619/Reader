/**
 * 反爬：验证码会话（桌面复用嗅探 WebView；完整 cookie 回灌后续 hardening）
 */

import { isAndroid, isTauri } from '@/lib/platform/detect';
import type { BangumiAntiCrawler } from '@/lib/media/video/bangumi/rules';

/** 打开站点页供用户完成验证码；超时后返回（不保证 cookie 已写入规则请求） */
export async function openAntiCrawlerSession(
  pageUrl: string,
  _cfg?: BangumiAntiCrawler,
  timeoutMs = 90000,
): Promise<boolean> {
  if (!isTauri() || isAndroid()) {
    return false;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('video_sniff_open_window', { url: pageUrl });
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 3000)));
    return true;
  } catch (e) {
    console.warn('[bangumi] anti-crawler session', e);
    return false;
  }
}

export class CaptchaRequiredError extends Error {
  constructor(public pageUrl: string) {
    super(`需要验证码: ${pageUrl}`);
    this.name = 'CaptchaRequiredError';
  }
}
