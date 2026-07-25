/**
 * 反爬：验证码会话
 * 检索阶段已改为 CaptchaRequiredError，不再弹可见嗅探窗（对齐 Kazumi）。
 * 此函数保留给将来「用户主动过验证」入口；默认也不再强弹独立窗。
 */

import { isAndroid, isTauri } from '@/lib/platform/detect';
import type { BangumiAntiCrawler } from '@/lib/media/video/bangumi/rules';

/** @deprecated 检索/抽流请勿调用；会打断无头抽流体验 */
export async function openAntiCrawlerSession(
  pageUrl: string,
  _cfg?: BangumiAntiCrawler,
  timeoutMs = 90000,
): Promise<boolean> {
  if (!isTauri() || isAndroid()) {
    return false;
  }
  console.warn(
    '[bangumi] openAntiCrawlerSession skipped (no visible sniff window); url=',
    pageUrl,
    'timeoutMs=',
    timeoutMs,
  );
  return false;
}

export class CaptchaRequiredError extends Error {
  constructor(public pageUrl: string) {
    super(`需要验证码: ${pageUrl}`);
    this.name = 'CaptchaRequiredError';
  }
}
