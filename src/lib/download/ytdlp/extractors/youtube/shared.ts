/**
 * Shared YouTube extraction helpers (innertube / ytInitialData / ytcfg).
 */

export const PLAYLIST_ID_RE =
  '(?:(?:PL|LL|EC|UU|FL|RD|UL|TL|PU|OLAK5uy_)[0-9A-Za-z-_]{10,}|RDMM|WL|LL|LM)';

const YT_HOST = '(?:www\\.|m\\.)?youtube\\.com';

export function normalizeYoutubeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^(?:PL|LL|EC|UU|FL|RD|UL|TL|PU|OLAK5uy_|RDMM|WL|LM)/.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function parseYoutubeQuery(url: string): { v: string | null; list: string | null } {
  try {
    const u = new URL(normalizeYoutubeUrl(url));
    return {
      v: u.searchParams.get('v'),
      list: u.searchParams.get('list'),
    };
  } catch {
    const v = url.match(/(?:[?&]v=|\/)([0-9A-Za-z_-]{11})/)?.[1] ?? null;
    const list = url.match(/[?&]list=([^&#]+)/)?.[1] ?? null;
    return { v, list: list ? decodeURIComponent(list) : null };
  }
}

export function extractBalancedObject(src: string, fromIdx: number): string | null {
  const start = src.indexOf('{', fromIdx);
  if (start < 0) return null;
  let depth = 0;
  let inStr: string | null = null;
  let escape = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i]!;
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

export function extractYtInitialData(webpage: string): Record<string, unknown> | null {
  const patterns = [
    /(?:window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=\s*(\{.+?\})\s*;\s*(?:var\s+(?:meta|head)|<\/script|\n)/s,
    /(?:window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=\s*(\{.+?\})\s*;/s,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m?.[1]) continue;
    try {
      return JSON.parse(m[1]) as Record<string, unknown>;
    } catch {
      const idx = webpage.search(/ytInitialData\s*=/);
      const sliced = idx >= 0 ? extractBalancedObject(webpage, idx) : null;
      if (sliced) {
        try {
          return JSON.parse(sliced) as Record<string, unknown>;
        } catch {
          /* continue */
        }
      }
    }
  }
  return null;
}

export function extractYtcfg(webpage: string): Record<string, unknown> {
  const m = webpage.match(/ytcfg\.set\s*\(\s*(\{.+?\})\s*\)\s*;/s);
  if (!m?.[1]) return defaultYtcfg();
  try {
    return (JSON.parse(m[1]) as Record<string, unknown>) || defaultYtcfg();
  } catch {
    const idx = webpage.indexOf('ytcfg.set');
    const sliced = idx >= 0 ? extractBalancedObject(webpage, idx) : null;
    if (sliced) {
      try {
        return JSON.parse(sliced) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return defaultYtcfg();
  }
}

function defaultYtcfg(): Record<string, unknown> {
  return {
    INNERTUBE_API_KEY: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
    INNERTUBE_CLIENT_VERSION: '2.20240101.00.00',
    INNERTUBE_CONTEXT_CLIENT_NAME: 1,
    INNERTUBE_CONTEXT: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'en',
        gl: 'US',
      },
    },
  };
}

export function getText(node: unknown, ...keys: string[]): string {
  if (!node || typeof node !== 'object') return '';
  let cur: unknown = node;
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur === 'string') return cur;
  if (cur && typeof cur === 'object') {
    const o = cur as Record<string, unknown>;
    if (typeof o.simpleText === 'string') return o.simpleText;
    if (typeof o.content === 'string') return o.content;
    const runs = o.runs as Array<Record<string, unknown>> | undefined;
    if (runs?.length) {
      return runs.map((r) => String(r.text || '')).join('');
    }
  }
  return '';
}

export function traverseObj(root: unknown, ...path: Array<string | number>): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur == null) return undefined;
    if (typeof seg === 'number') {
      cur = Array.isArray(cur) ? cur[seg] : undefined;
    } else {
      cur = typeof cur === 'object' ? (cur as Record<string, unknown>)[seg] : undefined;
    }
  }
  return cur;
}

export interface VideoRendererHit {
  videoId: string;
  title?: string;
}

/** Walk ytInitialData / API response for video renderers. */
export function collectVideoRenderers(data: unknown): VideoRendererHit[] {
  const out: VideoRendererHit[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    const rendererKeys = [
      'playlistVideoRenderer',
      'playlistPanelVideoRenderer',
      'videoRenderer',
      'gridVideoRenderer',
      'reelItemRenderer',
    ] as const;
    for (const key of rendererKeys) {
      const r = obj[key];
      if (r && typeof r === 'object') {
        const videoId = String((r as Record<string, unknown>).videoId || '');
        if (videoId && !seen.has(videoId)) {
          seen.add(videoId);
          out.push({ videoId, title: getText(r, 'title') || getText(r, 'headline') || undefined });
        }
      }
    }
    for (const val of Object.values(obj)) visit(val);
  };

  visit(data);
  return out;
}

export interface ContinuationQuery {
  continuation: string;
  clickTrackingParams?: string;
}

export function findContinuation(data: unknown): ContinuationQuery | null {
  const visit = (node: unknown): ContinuationQuery | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    const contItem = obj.continuationItemRenderer as Record<string, unknown> | undefined;
    if (contItem) {
      const ep = contItem.continuationEndpoint as Record<string, unknown> | undefined;
      const cmd = ep?.continuationCommand as Record<string, unknown> | undefined;
      const token = cmd?.token;
      if (typeof token === 'string' && token) {
        return {
          continuation: token,
          clickTrackingParams: typeof ep?.clickTrackingParams === 'string' ? ep.clickTrackingParams : undefined,
        };
      }
    }
    const nextData = obj.nextContinuationData as Record<string, unknown> | undefined;
    if (nextData && typeof nextData.continuation === 'string') {
      return {
        continuation: nextData.continuation,
        clickTrackingParams:
          typeof nextData.clickTrackingParams === 'string' ? nextData.clickTrackingParams : undefined,
      };
    }
    for (const val of Object.values(obj)) {
      const hit = visit(val);
      if (hit) return hit;
    }
    return null;
  };
  return visit(data);
}

export interface PlaylistMetadata {
  id: string;
  title: string;
  description?: string | null;
  channel?: string | null;
  channel_id?: string | null;
  channel_url?: string | null;
  uploader?: string | null;
}

export function extractPlaylistMetadata(
  data: Record<string, unknown>,
  fallbackId: string,
): PlaylistMetadata {
  const playlistMeta = traverseObj(data, 'metadata', 'playlistMetadataRenderer') as
    | Record<string, unknown>
    | undefined;
  const channelMeta = traverseObj(data, 'metadata', 'channelMetadataRenderer') as
    | Record<string, unknown>
    | undefined;
  const header = traverseObj(data, 'header', 'playlistHeaderRenderer') as Record<string, unknown> | undefined;

  const channelId =
    String(channelMeta?.externalId || playlistMeta?.ownerChannelId || '') ||
    undefined;
  const channelName = String(channelMeta?.title || getText(header, 'ownerText') || '') || undefined;
  const title =
    getText(playlistMeta, 'title') ||
    getText(header, 'title') ||
    (channelMeta ? `${String(channelMeta.title || fallbackId)} - Videos` : fallbackId);

  return {
    id: String(playlistMeta?.playlistId || channelId || fallbackId),
    title,
    description: String(playlistMeta?.description || channelMeta?.description || '') || null,
    channel: channelName || null,
    channel_id: channelId || null,
    channel_url: channelId ? `https://www.youtube.com/channel/${channelId}` : null,
    uploader: channelName || null,
  };
}

export function buildPlaylistPageUrl(listId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
}

export function buildChannelVideosUrl(id: string): string {
  if (id.startsWith('UC') && id.length >= 24) {
    return `https://www.youtube.com/channel/${id}/videos`;
  }
  return `https://www.youtube.com/@${id.replace(/^@/, '')}/videos`;
}

export const YT_TAB_URL_PATTERNS = {
  playlist: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/playlist\?(?:[^#]*&)?list=(?<list>${PLAYLIST_ID_RE})`,
    'i',
  ),
  watchWithList: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/watch\?(?:[^#]*&)?list=(?<list>${PLAYLIST_ID_RE})`,
    'i',
  ),
  channelVideos: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/channel/(?<id>UC[\w-]{22})/videos(?:[/?#]|$)`,
    'i',
  ),
  handleVideos: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/@(?<id>[\w.-]+)/videos(?:[/?#]|$)`,
    'i',
  ),
};

export async function innertubeContinuation(
  fetchJson: (
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) => Promise<Record<string, unknown> | null>,
  query: ContinuationQuery,
  ytcfg: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const apiKey = String(ytcfg.INNERTUBE_API_KEY || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8');
  const clientVersion = String(
    (traverseObj(ytcfg, 'INNERTUBE_CONTEXT', 'client', 'clientVersion') as string) ||
      ytcfg.INNERTUBE_CLIENT_VERSION ||
      '2.20240101.00.00',
  );
  const context =
    (ytcfg.INNERTUBE_CONTEXT as Record<string, unknown>) ||
    defaultYtcfg().INNERTUBE_CONTEXT;
  const visitorData = String(
    traverseObj(ytcfg, 'INNERTUBE_CONTEXT', 'client', 'visitorData') ||
      ytcfg.VISITOR_DATA ||
      '',
  );
  const endpoint = `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}&prettyPrint=false`;
  const body: Record<string, unknown> = {
    context,
    continuation: query.continuation,
  };
  if (query.clickTrackingParams) body.clickTracking = { clickTrackingParams: query.clickTrackingParams };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-YouTube-Client-Name': String(ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME || '1'),
    'X-YouTube-Client-Version': clientVersion,
    Origin: 'https://www.youtube.com',
  };
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  return fetchJson(endpoint, body, headers);
}
