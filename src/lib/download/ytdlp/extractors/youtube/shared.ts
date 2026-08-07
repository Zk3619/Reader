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
  duration?: number;
  view_count?: number;
  live_status?: string;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
}

function parseApproxDuration(text: string): number | undefined {
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if ([h, min, sec].some((n) => Number.isNaN(n))) return undefined;
  return h * 3600 + min * 60 + sec;
}

function parseViewCount(text: string): number | undefined {
  const cleaned = text.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/([\d.]+)\s*([KMB])?/i);
  if (!m) {
    const digits = cleaned.match(/(\d+)/);
    return digits ? Number(digits[1]) : undefined;
  }
  let n = Number(m[1]);
  if (Number.isNaN(n)) return undefined;
  const suf = (m[2] || '').toUpperCase();
  if (suf === 'K') n *= 1e3;
  else if (suf === 'M') n *= 1e6;
  else if (suf === 'B') n *= 1e9;
  return Math.round(n);
}

function extractThumbnails(node: unknown): VideoRendererHit['thumbnails'] {
  if (!node || typeof node !== 'object') return undefined;
  const thumbs =
    (node as Record<string, unknown>).thumbnails ||
    traverseObj(node, 'thumbnail', 'thumbnails') ||
    traverseObj(node, 'thumbnailRenderer', 'thumbnail', 'thumbnails');
  if (!Array.isArray(thumbs)) return undefined;
  const out: NonNullable<VideoRendererHit['thumbnails']> = [];
  for (const t of thumbs) {
    if (!t || typeof t !== 'object') continue;
    const url = String((t as Record<string, unknown>).url || '');
    if (!url) continue;
    out.push({
      url,
      width: typeof (t as Record<string, unknown>).width === 'number'
        ? ((t as Record<string, unknown>).width as number)
        : undefined,
      height: typeof (t as Record<string, unknown>).height === 'number'
        ? ((t as Record<string, unknown>).height as number)
        : undefined,
    });
  }
  return out.length ? out : undefined;
}

function enrichFromRenderer(r: Record<string, unknown>): Omit<VideoRendererHit, 'videoId'> {
  const title = getText(r, 'title') || getText(r, 'headline') || getText(r, 'overlayMetadata', 'primaryText') || undefined;
  const lengthText = getText(r, 'lengthText');
  // thumbnailOverlays is often an array — try common paths
  let duration = lengthText ? parseApproxDuration(lengthText) : undefined;
  if (duration == null) {
    const overlays = r.thumbnailOverlays;
    if (Array.isArray(overlays)) {
      for (const o of overlays) {
        const t = getText(o, 'thumbnailOverlayTimeStatusRenderer', 'text');
        duration = t ? parseApproxDuration(t) : undefined;
        if (duration != null) break;
      }
    }
  }
  const viewText =
    getText(r, 'viewCountText') ||
    getText(r, 'shortViewCountText') ||
    getText(r, 'overlayMetadata', 'secondaryText');
  const view_count = viewText ? parseViewCount(viewText) : undefined;
  let live_status: string | undefined;
  const badges = r.badges;
  if (Array.isArray(badges)) {
    for (const b of badges) {
      const label = getText(b, 'metadataBadgeRenderer', 'label').toLowerCase();
      if (label.includes('live')) live_status = 'is_live';
    }
  }
  const style = String(
    traverseObj(r, 'thumbnailOverlays', 0, 'thumbnailOverlayTimeStatusRenderer', 'style') || '',
  ).toUpperCase();
  if (style.includes('LIVE')) live_status = live_status || 'is_live';
  return {
    title,
    duration,
    view_count,
    live_status,
    thumbnails: extractThumbnails(r),
  };
}

function videoIdFromLockup(r: Record<string, unknown>): string {
  const direct = String(r.videoId || r.entityId || '');
  if (/^[0-9A-Za-z_-]{11}$/.test(direct)) return direct;
  const contentId = String(r.contentId || '');
  if (/^[0-9A-Za-z_-]{11}$/.test(contentId)) return contentId;
  const nav = traverseObj(r, 'onTap', 'innertubeCommand', 'watchEndpoint', 'videoId');
  if (typeof nav === 'string' && /^[0-9A-Za-z_-]{11}$/.test(nav)) return nav;
  const we = traverseObj(r, 'navigationEndpoint', 'watchEndpoint', 'videoId');
  if (typeof we === 'string' && /^[0-9A-Za-z_-]{11}$/.test(we)) return we;
  // shortsLockupViewModel often uses entityId like "shorts-video-id"
  const ent = String(r.entityId || '');
  const m = ent.match(/([0-9A-Za-z_-]{11})$/);
  return m?.[1] || '';
}

/** Walk ytInitialData / API response for video renderers. */
export function collectVideoRenderers(data: unknown): VideoRendererHit[] {
  const out: VideoRendererHit[] = [];
  const seen = new Set<string>();

  const push = (videoId: string, extra: Omit<VideoRendererHit, 'videoId'>) => {
    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);
    out.push({ videoId, ...extra });
  };

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
        if (videoId) push(videoId, enrichFromRenderer(r as Record<string, unknown>));
      }
    }
    for (const key of ['shortsLockupViewModel', 'lockupViewModel'] as const) {
      const r = obj[key];
      if (r && typeof r === 'object') {
        const rec = r as Record<string, unknown>;
        const videoId = videoIdFromLockup(rec);
        if (videoId) push(videoId, enrichFromRenderer(rec));
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

    // Prefer structured continuation payloads from browse responses
    for (const key of ['onResponseReceivedActions', 'onResponseReceivedEndpoints'] as const) {
      const actions = obj[key];
      if (Array.isArray(actions)) {
        for (const action of actions) {
          const hit = visit(action);
          if (hit) return hit;
        }
      }
    }
    const contContents = obj.continuationContents;
    if (contContents && typeof contContents === 'object') {
      const hit = visit(contContents);
      if (hit) return hit;
    }

    const contItem = obj.continuationItemRenderer as Record<string, unknown> | undefined;
    if (contItem) {
      const ep =
        (contItem.continuationEndpoint as Record<string, unknown> | undefined) ||
        (traverseObj(contItem, 'button', 'buttonRenderer', 'command') as
          | Record<string, unknown>
          | undefined);
      const cmd =
        (ep?.continuationCommand as Record<string, unknown> | undefined) ||
        (ep?.command as Record<string, unknown> | undefined);
      const token = cmd?.token || (ep?.continuationCommand as Record<string, unknown> | undefined)?.token;
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
    // reloadContinuationData / timedContinuationData
    for (const key of ['reloadContinuationData', 'timedContinuationData'] as const) {
      const d = obj[key] as Record<string, unknown> | undefined;
      if (d && typeof d.continuation === 'string') {
        return {
          continuation: d.continuation,
          clickTrackingParams:
            typeof d.clickTrackingParams === 'string' ? d.clickTrackingParams : undefined,
        };
      }
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
  uploader_id?: string | null;
  availability?: string | null;
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
  const pageHeader = traverseObj(data, 'header', 'pageHeaderRenderer') as Record<string, unknown> | undefined;

  const channelId =
    String(channelMeta?.externalId || playlistMeta?.ownerChannelId || '') ||
    undefined;
  const channelName =
    String(channelMeta?.title || getText(header, 'ownerText') || getText(pageHeader, 'pageTitle') || '') ||
    undefined;
  const title =
    getText(playlistMeta, 'title') ||
    getText(header, 'title') ||
    getText(pageHeader, 'pageTitle') ||
    (channelMeta ? `${String(channelMeta.title || fallbackId)} - Videos` : fallbackId);

  let availability: string | null = null;
  const privacy = String(playlistMeta?.privacy || header?.privacy || '').toLowerCase();
  if (privacy.includes('private')) availability = 'private';
  else if (privacy.includes('unlisted')) availability = 'unlisted';
  else if (privacy.includes('public') || privacy) availability = 'public';

  return {
    id: String(playlistMeta?.playlistId || channelId || fallbackId),
    title,
    description: String(playlistMeta?.description || channelMeta?.description || '') || null,
    channel: channelName || null,
    channel_id: channelId || null,
    channel_url: channelId ? `https://www.youtube.com/channel/${channelId}` : null,
    uploader: channelName || null,
    uploader_id: channelId || null,
    availability,
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
    String.raw`(?:https?:)?//${YT_HOST}/channel/(?<id>UC[\w-]{22})(?:/(?<tab>videos|shorts|streams))?(?:[/?#]|$)`,
    'i',
  ),
  handleVideos: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/@(?<id>[\w.-]+)(?:/(?<tab>videos|shorts|streams))?(?:[/?#]|$)`,
    'i',
  ),
  /** /c/Name or /c/Name/videos|shorts|streams */
  cVideos: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/c/(?<id>[\w.-]+)(?:/(?<tab>videos|shorts|streams))?(?:[/?#]|$)`,
    'i',
  ),
  /** /user/Name or /user/Name/videos|shorts|streams */
  userVideos: new RegExp(
    String.raw`(?:https?:)?//${YT_HOST}/user/(?<id>[\w.-]+)(?:/(?<tab>videos|shorts|streams))?(?:[/?#]|$)`,
    'i',
  ),
};

export function buildChannelTabUrl(id: string, tab = 'videos'): string {
  if (/^UC[\w-]{22}$/.test(id)) {
    return `https://www.youtube.com/channel/${id}/${tab}`;
  }
  if (id.startsWith('@')) {
    return `https://www.youtube.com/${id}/${tab}`;
  }
  return `https://www.youtube.com/@${id.replace(/^@/, '')}/${tab}`;
}

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
