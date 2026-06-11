/**
 * 订阅源使用日志（控制台 [rss] 前缀）
 * 便于区分实现问题与源站异常。
 */

import { HttpError } from '@/lib/http';
import type { RssSource } from '@/types';

const LOG_TAG = '[rss]';

function sourceLabel(source: RssSource | string): string {
  if (typeof source === 'string') return source;
  return source.sourceName?.trim() || source.sourceUrl;
}

function truncate(text: string, max = 160): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function previewBody(body: string | undefined, max = 120): string | undefined {
  if (!body) return undefined;
  const compact = body.replace(/\s+/g, ' ').trim();
  return truncate(compact, max);
}

export function formatRssError(error: unknown): Record<string, unknown> {
  if (error instanceof HttpError) {
    return {
      kind: 'http',
      status: error.status,
      statusText: error.statusText,
      url: truncate(error.url, 200),
      message: error.message,
      bodyPreview: previewBody(error.body),
    };
  }
  if (error instanceof Error) {
    return { kind: error.name || 'error', message: error.message };
  }
  return { kind: 'unknown', message: String(error) };
}

export function rssLog(
  source: RssSource | string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const label = sourceLabel(source);
  if (extra && Object.keys(extra).length > 0) {
    console.log(`${LOG_TAG} [${label}] ${message}`, extra);
  } else {
    console.log(`${LOG_TAG} [${label}] ${message}`);
  }
}

export function rssWarn(
  source: RssSource | string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const label = sourceLabel(source);
  if (extra && Object.keys(extra).length > 0) {
    console.warn(`${LOG_TAG} [${label}] ${message}`, extra);
  } else {
    console.warn(`${LOG_TAG} [${label}] ${message}`);
  }
}

export function rssError(
  source: RssSource | string,
  message: string,
  error?: unknown,
  extra?: Record<string, unknown>,
): void {
  const label = sourceLabel(source);
  const payload = {
    ...extra,
    ...(error !== undefined ? { error: formatRssError(error) } : {}),
  };
  if (Object.keys(payload).length > 0) {
    console.error(`${LOG_TAG} [${label}] ${message}`, payload);
  } else {
    console.error(`${LOG_TAG} [${label}] ${message}`);
  }
}

export { truncate as truncateRssLogText };
