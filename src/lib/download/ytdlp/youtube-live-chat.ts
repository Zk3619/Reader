/**
 * YouTube live chat FD — yt-dlp downloader/youtube_live_chat.py subset.
 * Writes JSONL (one action / pseudo-action per line) until continuation ends.
 */

import { downloadBinaryProxyArgs } from '@/lib/http/download-binary-proxy';

export type YoutubeLiveChatOpts = {
  url: string;
  outputPath: string;
  videoId?: string;
  protocol?: string;
  headers?: Record<string, string>;
  /** Cap fragments for tests / short runs */
  maxFragments?: number;
  /** Live chat runs until stream ends; default max wall time 6h */
  maxLiveMs?: number;
};

function tryGet<T>(obj: unknown, path: Array<string | number>): T | undefined {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur as T | undefined;
}

function extractYtInitialData(html: string): Record<string, unknown> | null {
  const m =
    /ytInitialData\s*=\s*(\{.+?\})\s*;\s*(?:<\/script>|\n)/s.exec(html) ||
    /var\s+ytInitialData\s*=\s*(\{.+?\})\s*;/s.exec(html);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractYtcfg(html: string): Record<string, unknown> | null {
  const m = /ytcfg\.set\((\{.+?\})\);/s.exec(html);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function httpText(
  url: string,
  headers?: Record<string, string>,
  body?: string,
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<{ data: number[]; status: number }>('download_binary', {
    url,
    method: body ? 'POST' : 'GET',
    headers: {
      ...(headers || {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ?? null,
    timeoutMs: 60000,
    useOkhttpUserAgent: false,
    ...downloadBinaryProxyArgs(),
  });
  if (result.status >= 400) throw new Error(`HTTP ${result.status}`);
  return new TextDecoder().decode(new Uint8Array(result.data));
}

function parseLiveTimestamp(action: Record<string, unknown>): number | null {
  const actionContent =
    (action.addChatItemAction as Record<string, unknown>) ||
    (action.addLiveChatTickerItemAction as Record<string, unknown>) ||
    (action.addBannerToLiveChatCommand as Record<string, unknown>);
  if (!actionContent || typeof actionContent !== 'object') return null;
  const item =
    (actionContent.item as Record<string, unknown>) ||
    (actionContent.bannerRenderer as Record<string, unknown>);
  if (!item || typeof item !== 'object') return null;
  for (const key of [
    'liveChatTextMessageRenderer',
    'liveChatPaidMessageRenderer',
    'liveChatMembershipItemRenderer',
    'liveChatPaidStickerRenderer',
    'liveChatTickerPaidMessageItemRenderer',
    'liveChatTickerSponsorItemRenderer',
    'liveChatBannerRenderer',
  ]) {
    const renderer = item[key] as Record<string, unknown> | undefined;
    if (!renderer) continue;
    const ts = renderer.timestampUsec || renderer.timestampText;
    if (typeof ts === 'string' && /^\d+$/.test(ts)) return Math.floor(Number(ts) / 1000);
    if (typeof ts === 'number') return ts;
  }
  return null;
}

/**
 * Download youtube_live_chat / youtube_live_chat_replay to JSONL.
 */
export async function downloadYoutubeLiveChat(opts: YoutubeLiveChatOpts): Promise<string> {
  const isReplay =
    (opts.protocol || '').toLowerCase() === 'youtube_live_chat_replay' ||
    /live_chat_replay/i.test(opts.url);
  const maxFrags = opts.maxFragments ?? (isReplay ? 5000 : 10_000);
  const maxLiveMs = opts.maxLiveMs ?? 6 * 3600 * 1000;
  const started = Date.now();
  const lines: string[] = [];

  const pageHtml = await httpText(opts.url, opts.headers);
  let data = extractYtInitialData(pageHtml);
  if (!data) {
    try {
      data = JSON.parse(pageHtml) as Record<string, unknown>;
    } catch {
      throw new Error('youtube_live_chat: unable to parse initial page');
    }
  }

  let continuationId =
    tryGet<string>(data, [
      'contents',
      'twoColumnWatchNextResults',
      'conversationBar',
      'liveChatRenderer',
      'continuations',
      0,
      'reloadContinuationData',
      'continuation',
    ]) ||
    tryGet<string>(data, [
      'continuationContents',
      'liveChatContinuation',
      'continuations',
      0,
      'reloadContinuationData',
      'continuation',
    ]);

  const ytcfg = extractYtcfg(pageHtml) || {};
  const apiKey = tryGet<string>(ytcfg, ['INNERTUBE_API_KEY']);
  const innertubeContext = tryGet<Record<string, unknown>>(ytcfg, ['INNERTUBE_CONTEXT']);
  if (!apiKey || !innertubeContext || !continuationId) {
    // Soft path: dump whatever actions already on the page
    const actions =
      tryGet<unknown[]>(data, ['continuationContents', 'liveChatContinuation', 'actions']) || [];
    for (const a of actions) lines.push(JSON.stringify(a));
    await writeJsonl(opts.outputPath, lines);
    if (!lines.length) {
      throw new Error('youtube_live_chat: missing api key / continuation (need watch page cookies?)');
    }
    return opts.outputPath;
  }

  const apiUrl = isReplay
    ? `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=${apiKey}`
    : `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`;
  const chatPageUrl = isReplay
    ? `https://www.youtube.com/live_chat_replay?continuation=${continuationId}`
    : `https://www.youtube.com/live_chat?continuation=${continuationId}`;

  let offset = 0;
  let liveOffset = 0;
  const startTime = Date.now();
  let clickTrackingParams: string | undefined;

  for (let fragIndex = 1; fragIndex <= maxFrags && continuationId; fragIndex++) {
    if (!isReplay && Date.now() - started > maxLiveMs) break;

    let liveChatContinuation: Record<string, unknown> = {};
    if (fragIndex === 1) {
      const chatHtml = await httpText(chatPageUrl, opts.headers);
      const chatData = extractYtInitialData(chatHtml) || JSON.parse(chatHtml);
      liveChatContinuation =
        tryGet<Record<string, unknown>>(chatData, [
          'continuationContents',
          'liveChatContinuation',
        ]) || {};
    } else {
      const requestData: Record<string, unknown> = {
        context: innertubeContext,
        continuation: continuationId,
        currentPlayerState: { playerOffsetMs: String(Math.max(offset - 5000, 0)) },
      };
      if (clickTrackingParams) {
        (requestData.context as Record<string, unknown>).clickTracking = {
          clickTrackingParams,
        };
      }
      const raw = await httpText(apiUrl, opts.headers, JSON.stringify(requestData));
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      liveChatContinuation =
        tryGet<Record<string, unknown>>(parsed, [
          'continuationContents',
          'liveChatContinuation',
        ]) || {};
    }

    const actions = (liveChatContinuation.actions as unknown[]) || [];
    if (isReplay) {
      for (const action of actions) {
        const a = action as Record<string, unknown>;
        if (a.replayChatItemAction) {
          const r = a.replayChatItemAction as Record<string, unknown>;
          offset = Number(r.videoOffsetTimeMsec) || offset;
        }
        lines.push(JSON.stringify(action));
      }
      const cont =
        tryGet<Record<string, unknown>>(liveChatContinuation, [
          'continuations',
          0,
          'liveChatReplayContinuationData',
        ]) || {};
      continuationId = (cont.continuation as string) || undefined;
      clickTrackingParams = (cont.clickTrackingParams as string) || clickTrackingParams;
    } else {
      for (const action of actions) {
        const a = action as Record<string, unknown>;
        const ts = parseLiveTimestamp(a);
        if (ts != null) liveOffset = ts - startTime;
        lines.push(
          JSON.stringify({
            replayChatItemAction: { actions: [action] },
            videoOffsetTimeMsec: String(liveOffset),
            isLive: true,
          }),
        );
      }
      const cont =
        tryGet<Record<string, unknown>>(liveChatContinuation, [
          'continuations',
          0,
          'invalidationContinuationData',
        ]) ||
        tryGet<Record<string, unknown>>(liveChatContinuation, [
          'continuations',
          0,
          'timedContinuationData',
        ]) ||
        {};
      continuationId = (cont.continuation as string) || undefined;
      clickTrackingParams = (cont.clickTrackingParams as string) || clickTrackingParams;
      const timeoutMs = Number(cont.timeoutMs);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 15_000)));
      }
    }

    if (!actions.length && !continuationId) break;
  }

  await writeJsonl(opts.outputPath, lines);
  return opts.outputPath;
}

async function writeJsonl(path: string, lines: string[]): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const data = new TextEncoder().encode(lines.join('\n') + (lines.length ? '\n' : ''));
  await invoke('write_binary_file', { path, data: Array.from(data) });
}
