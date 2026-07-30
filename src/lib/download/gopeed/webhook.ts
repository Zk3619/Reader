/**
 * 下载完成/失败 Webhook（对齐 Gopeed DOWNLOAD_DONE / DOWNLOAD_ERROR）
 */

import type { DownloadTask } from '@/lib/download/task-model';
import { getDownloadConfig } from '@/lib/download/gopeed/config';

export type WebhookEvent = 'DOWNLOAD_DONE' | 'DOWNLOAD_ERROR';

export interface WebhookPayload {
  task: DownloadTask;
}

export interface WebhookData {
  event: WebhookEvent;
  /** Unix ms */
  time: number;
  payload: WebhookPayload;
}

export interface WebhookSendResult {
  url: string;
  ok: boolean;
  status: number;
  error?: string;
}

const WEBHOOK_TIMEOUT_MS = 10_000;

export async function postWebhook(
  url: string,
  data: WebhookData,
): Promise<WebhookSendResult> {
  if (!url) {
    return { url, ok: false, status: 0, error: 'webhook URL is empty' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Reader-Download-Webhook/1.0',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    return {
      url,
      ok: resp.ok,
      status: resp.status,
      error: resp.ok ? undefined : `HTTP ${resp.status}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url, ok: false, status: 0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 向配置中的 webhookUrl（逗号/换行分隔多 URL）发送事件。
 */
export async function fireDownloadWebhook(
  event: WebhookEvent,
  task: DownloadTask,
  urls?: string[],
): Promise<WebhookSendResult[]> {
  let targets = urls;
  if (!targets) {
    const cfg = await getDownloadConfig();
    const raw = (cfg.webhookUrl || '').trim();
    targets = raw
      ? raw
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }
  if (targets.length === 0) return [];

  const data: WebhookData = {
    event,
    time: Date.now(),
    payload: { task: { ...task, meta: { ...task.meta } } },
  };

  return Promise.all(targets.map((url) => postWebhook(url, data)));
}
