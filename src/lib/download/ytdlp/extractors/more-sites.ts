/**
 * Douyin / Instagram / Reddit / Niconico — 高价值站点精简实现。
 * Bangumi 已拆到 bilibili-bangumi.ts。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { extractJsonAssign } from './bilibili-shared';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const IG_ENCODING_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function igShortcodeToMediaId(shortcode: string): string {
  let sc = shortcode;
  if (sc.length > 28) sc = sc.slice(0, -28);
  let id = BigInt(0);
  for (const c of sc) {
    const idx = IG_ENCODING_CHARS.indexOf(c);
    if (idx < 0) continue;
    id = id * BigInt(64) + BigInt(idx);
  }
  return id.toString();
}

function igCarouselNodes(media: Record<string, unknown>): Record<string, unknown>[] {
  const carousel = (media.carousel_media || media.edge_sidecar_to_children) as
    | Array<Record<string, unknown>>
    | { edges?: Array<{ node?: Record<string, unknown> }> }
    | undefined;
  if (Array.isArray(carousel)) return carousel;
  return (carousel?.edges || []).map((e) => e.node!).filter(Boolean);
}

function igHasVideo(node: Record<string, unknown>): boolean {
  return Boolean(node.video_url || (node.video_versions as unknown[])?.length);
}

function igExtractFormats(
  media: Record<string, unknown>,
  headers: Record<string, string>,
): Format[] {
  const formats: Format[] = [];
  const push = (u: string | undefined, fid: string, meta: Partial<Format> = {}) => {
    if (!u) return;
    formats.push({
      format_id: fid,
      url: u,
      ext: 'mp4',
      protocol: 'https',
      vcodec: 'h264',
      acodec: 'aac',
      http_headers: headers,
      ...meta,
    });
  };

  push(String(media.video_url || '') || undefined, 'video');
  const versions = (media.video_versions as Array<{ url?: string; width?: number; height?: number; id?: string; type?: number }>) || [];
  versions.forEach((v, i) =>
    push(v.url, String(v.id || `v${i}`), {
      width: Number(v.width) || null,
      height: Number(v.height) || null,
    }),
  );
  return formats;
}

function igExtractThumbnails(media: Record<string, unknown>): Array<{ url: string; width?: number | null; height?: number | null }> {
  const out: Array<{ url: string; width?: number | null; height?: number | null }> = [];
  const seen = new Set<string>();
  const pushThumb = (url: unknown, width?: unknown, height?: unknown) => {
    const u = String(url || '');
    if (!u.startsWith('http') || seen.has(u)) return;
    seen.add(u);
    out.push({
      url: u,
      width: Number(width) || null,
      height: Number(height) || null,
    });
  };

  const candidates =
    ((media.image_versions2 as Record<string, unknown>)?.candidates as Array<Record<string, unknown>>) ||
    (media.display_resources as Array<Record<string, unknown>>) ||
    [];
  for (const c of candidates) pushThumb(c.url, c.width, c.height);

  const cover = media.cover || media.origin_cover || media.dynamic_cover;
  const coverList = (cover as Record<string, unknown>)?.url_list;
  if (Array.isArray(coverList)) {
    for (const u of coverList) pushThumb(u);
  }

  return out;
}

export { DouyinIE } from './hand-d/douyin';

export { BiliBangumiIE } from './bilibili-bangumi';

export class InstagramIE extends InfoExtractor {
  static IE_NAME = 'Instagram';
  static IE_DESC = 'Instagram';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?instagram\.com(?:\/[^/?#]+)?\/(?:p|tv|reels?)\/(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Instagram id', { expected: true });

    const headers = {
      'User-Agent': UA,
      Referer: 'https://www.instagram.com/',
      'X-IG-App-ID': '936619743392459',
    };
    const pageUrl = `https://www.instagram.com/p/${id}/`;

    // 1) REST media info (works with session cookies)
    const apiResp = await this._download_json<{
      items?: Array<Record<string, unknown>>;
    }>(
      `https://www.instagram.com/api/v1/media/${igShortcodeToMediaId(id)}/info/`,
      id,
      'Downloading Instagram media info',
      { headers, fatal: false },
    ).catch(() => null);

    let media = apiResp?.items?.[0];

    // 2) GraphQL doc_id fallback when REST fails (logged-out / no cookies)
    if (!media) {
      media =
        (await this.tryInstagramGraphql(id, pageUrl, headers)) ||
        undefined;
    }

    const webpage = await this._download_webpage(pageUrl, id, 'Downloading Instagram webpage', {
      headers,
      fatal: false,
    });

    if (!media && webpage) {
      const shared = extractJsonAssign(webpage, /window\._sharedData\s*=/) ||
        extractJsonAssign(webpage, /"xdt_api__v1__media__shortcode__web_info"/);
      media = findIgMedia(shared || webpage) || undefined;
    }

    if (!media) {
      this.raise_login_required(
        'Instagram requires login or session cookies (sessionid) — no video formats without authentication',
      );
    }

    const caption =
      String(media!.caption || '') ||
      String(
        (media!.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> })?.edges?.[0]
          ?.node?.text || '',
      ) ||
      id;
    const title = caption.length > 200 ? caption.slice(0, 200) : caption;

    const carouselNodes = igCarouselNodes(media!);
    const videoNodes = carouselNodes.filter(igHasVideo);

    if (videoNodes.length > 1) {
      const entries = videoNodes.map((node, i) => {
        const nodeId = String(node.pk || node.id || `${id}-${i + 1}`);
        const fmts = igExtractFormats(node, headers);
        const thumbs = igExtractThumbnails(node);
        return {
          id: nodeId,
          title: `Video ${i + 1}`,
          webpage_url: pageUrl,
          original_url: url,
          formats: fmts,
          thumbnail: thumbs[0]?.url,
          thumbnails: thumbs.length ? thumbs : undefined,
          extractor: 'Instagram',
          extractor_key: 'Instagram',
          http_headers: headers,
        } satisfies VideoInfo;
      });
      return this.playlist_result(entries, id, title || `Post by ${id}`, caption);
    }

    const target = videoNodes[0] || media!;
    const formats = igExtractFormats(target, headers);

    if (!formats.length && webpage) {
      const og = webpage.match(
        /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)/i,
      );
      if (og?.[1]) {
        formats.push({
          format_id: 'og',
          url: og[1],
          ext: 'mp4',
          protocol: 'https',
          vcodec: 'h264',
          acodec: 'aac',
          http_headers: headers,
        });
      }
      for (const mm of webpage.matchAll(/"video_url"\s*:\s*"([^"]+)"/g)) {
        const u = mm[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        if (u) {
          formats.push({
            format_id: 'json',
            url: u,
            ext: 'mp4',
            protocol: 'https',
            vcodec: 'h264',
            acodec: 'aac',
            http_headers: headers,
          });
        }
      }
    }

    if (!formats.length) {
      this.raise_login_required(
        'Instagram post has no downloadable video — login or valid sessionid cookie required',
      );
    }

    const thumbs = igExtractThumbnails(target);

    return {
      id,
      title,
      description: caption,
      webpage_url: pageUrl,
      original_url: url,
      formats,
      thumbnail: thumbs[0]?.url,
      thumbnails: thumbs.length ? thumbs : undefined,
      extractor: 'Instagram',
      extractor_key: 'Instagram',
      http_headers: headers,
    };
  }

  private async tryInstagramGraphql(
    shortcode: string,
    pageUrl: string,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown> | null> {
    const mediaId = igShortcodeToMediaId(shortcode);
    const body = new URLSearchParams({
      doc_id: '27130156389949648',
      variables: JSON.stringify({ media_id: mediaId }),
      server_timestamps: 'true',
    }).toString();

    const gql = await this._download_json<{
      data?: {
        xig_polaris_media?: {
          if_not_gated_logged_out?: Record<string, unknown>;
        };
        xdt_shortcode_media?: Record<string, unknown> | null;
      };
    }>('https://www.instagram.com/api/graphql', shortcode, 'Downloading Instagram GraphQL', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': 'PolarisLoggedOutDesktopWWWPostRootContentQuery',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: pageUrl,
      },
      data: body,
      fatal: false,
    }).catch(() => null);

    const fromPolaris = gql?.data?.xig_polaris_media?.if_not_gated_logged_out;
    if (fromPolaris) return fromPolaris;
    if (gql?.data?.xdt_shortcode_media) return gql.data.xdt_shortcode_media;

    // Best-effort shortcode query endpoint
    const alt = await this._download_json<{
      data?: { shortcode_media?: Record<string, unknown> };
    }>(
      `https://www.instagram.com/graphql/query/?query_hash=2c4d4d037b69146ce6253e232d446a7a&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`,
      shortcode,
      'Downloading Instagram shortcode GraphQL',
      { headers, fatal: false },
    ).catch(() => null);

    return alt?.data?.shortcode_media || null;
  }
}

function findIgMedia(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (!obj || depth > 10) return null;
  if (typeof obj === 'string') {
    try {
      return findIgMedia(JSON.parse(obj), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  if (rec.video_url || rec.video_versions) return rec;
  if (rec.shortcode_media && typeof rec.shortcode_media === 'object') {
    return rec.shortcode_media as Record<string, unknown>;
  }
  for (const v of Object.values(rec)) {
    const hit = findIgMedia(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export class RedditIE extends InfoExtractor {
  static IE_NAME = 'Reddit';
  static IE_DESC = 'Reddit';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)?reddit(?:media)?\.com\/(?:(?:r|user)\/[^/]+\/)?comments\/(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Reddit id', { expected: true });

    const headers = { 'User-Agent': UA };
    const jsonUrl = url.replace(/\/?(\?.*)?$/, '') + '.json';
    const data = await this._download_json<unknown>(jsonUrl, id, 'Downloading Reddit JSON', {
      headers,
      fatal: false,
    });
    const post = extractRedditPost(data);
    if (!post) throw new ExtractorError('Unable to extract Reddit post', { expected: true });

    const media = (post.media || post.secure_media || {}) as Record<string, unknown>;
    const redditVideo = (media.reddit_video || {}) as Record<string, unknown>;
    const formats: Format[] = [];
    const dash = String(redditVideo.dash_url || '');
    const hls = String(redditVideo.hls_url || '');
    const fallback = String(redditVideo.fallback_url || '');
    if (dash) {
      formats.push({
        format_id: 'dash',
        url: dash,
        ext: 'mp4',
        protocol: 'http_dash_segments',
        vcodec: 'h264',
        acodec: 'aac',
      });
    }
    if (hls) {
      formats.push({
        format_id: 'hls',
        url: hls,
        ext: 'mp4',
        protocol: 'm3u8_native',
        vcodec: 'h264',
        acodec: 'aac',
      });
    }
    if (fallback) {
      formats.push({
        format_id: 'fallback',
        url: fallback,
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'none',
      });
    }

    // Crosspost / preview fallbacks
    const preview = (post.preview as { reddit_video_preview?: Record<string, unknown> })
      ?.reddit_video_preview;
    if (!formats.length && preview?.fallback_url) {
      formats.push({
        format_id: 'preview',
        url: String(preview.fallback_url),
        ext: 'mp4',
        protocol: 'https',
      });
    }

    if (!formats.length) {
      const urlOverridden = String(post.url_overridden_by_dest || post.url || '');
      if (/\.(mp4|gif|webm)(\?|$)/i.test(urlOverridden)) {
        formats.push({
          format_id: 'direct',
          url: urlOverridden,
          ext: urlOverridden.includes('.gif') ? 'gif' : 'mp4',
          protocol: 'https',
        });
      }
    }

    if (!formats.length) {
      throw new ExtractorError('No Reddit video formats (image/text post?)', { expected: true });
    }

    const slug = String(post.permalink || `comments/${id}`);
    const title = String(post.title || id);

    return {
      id,
      title,
      uploader: String(post.author || '') || undefined,
      thumbnail: String(post.thumbnail || '') || undefined,
      duration: Number(redditVideo?.duration) || null,
      webpage_url: `https://www.reddit.com/${slug}`,
      original_url: url,
      formats,
      extractor: 'Reddit',
      extractor_key: 'Reddit',
    };
  }
}

function extractRedditPost(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data)) return null;
  const listing = data[0] as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
  return listing?.data?.children?.[0]?.data || null;
}

export class NiconicoIE extends InfoExtractor {
  static IE_NAME = 'Niconico';
  static IE_DESC = 'ニコニコ動画';
  static _VALID_URL =
    /https?:\/\/(?:(?:embed|sp|www)\.)?nicovideo\.jp\/(?:shorts|watch)\/(?<id>(?:[a-z]{2})?\d+)/i;
  static _GEO_BYPASS = false;
  static _GEO_COUNTRIES = ['JP'];

  private static readonly API_BASE = 'https://nvapi.nicovideo.jp';
  private static readonly BASE_URL = 'https://www.nicovideo.jp';
  private static readonly NICO_HEADERS = {
    'X-Frontend-ID': '6',
    'X-Frontend-Version': '0',
  };

  private static readonly ERROR_MAP: Record<string, Record<string, string>> = {
    FORBIDDEN: {
      ADMINISTRATOR_DELETE_VIDEO: 'Video unavailable, possibly removed by admins',
      CHANNEL_MEMBER_ONLY: 'Channel members only',
      DELETED_CHANNEL_VIDEO: 'Video unavailable, channel was closed',
      DELETED_COMMUNITY_VIDEO: 'Video unavailable, community deleted or missing',
      DEFAULT: 'Page unavailable, check the URL',
      HARMFUL_VIDEO: 'Sensitive content, login required',
      HIDDEN_VIDEO: 'Video unavailable, set to private',
      NOT_ALLOWED: 'No permission',
      PPV_VIDEO: 'PPV video, payment information required',
      PREMIUM_ONLY: 'Premium members only',
    },
    INVALID_PARAMETER: {
      DEFAULT: 'Video unavailable, may not exist or was deleted',
    },
    MAINTENANCE: { DEFAULT: 'Maintenance is in progress' },
    NOT_FOUND: {
      DEFAULT: 'Video unavailable, may not exist or was deleted',
      RIGHT_HOLDER_DELETE_VIDEO: 'Removed by rights-holder request',
    },
    UNAUTHORIZED: { DEFAULT: 'Invalid session, re-login required' },
    UNKNOWN: { DEFAULT: 'Failed to fetch content' },
  };

  private get isLoggedIn(): boolean {
    try {
      return Boolean(this._get_cookies('https://www.nicovideo.jp').user_session);
    } catch {
      return false;
    }
  }

  private async extractDomandFormats(
    apiData: Record<string, unknown>,
    videoId: string,
  ): Promise<Format[]> {
    const media = (apiData.media as Record<string, unknown>) || {};
    const domand = (media.domand as Record<string, unknown>) || {};
    const videos = ((domand.videos as Array<Record<string, unknown>>) || []).filter(
      (v) => v?.isAvailable && v?.id,
    );
    const audios = ((domand.audios as Array<Record<string, unknown>>) || []).filter(
      (v) => v?.isAvailable && v?.id,
    );
    const accessKey = String(domand.accessRightKey || '');
    const trackId = String(
      ((apiData.client as Record<string, unknown>)?.watchTrackId as string) || '',
    );
    if (!videos.length || !audios.length || !accessKey || !trackId) return [];

    // yt-dlp: product of all available video × audio ids
    const outputs: string[][] = [];
    for (const v of videos) {
      for (const a of audios) {
        outputs.push([String(v.id), String(a.id)]);
      }
    }

    const resp = await this._download_json<{
      data?: { contentUrl?: string };
      meta?: { status?: number };
    }>(
      `${NiconicoIE.API_BASE}/v1/watch/${videoId}/access-rights/hls`,
      videoId,
      'Downloading niconico HLS access rights',
      {
        method: 'POST',
        query: { actionTrackId: trackId },
        headers: {
          Accept: 'application/json;charset=utf-8',
          'Content-Type': 'application/json',
          'X-Access-Right-Key': accessKey,
          'X-Request-With': NiconicoIE.BASE_URL,
          Origin: NiconicoIE.BASE_URL,
          Referer: `${NiconicoIE.BASE_URL}/`,
          'User-Agent': UA,
          ...NiconicoIE.NICO_HEADERS,
          ...this.geo_verification_headers(),
        },
        data: JSON.stringify({ outputs }),
        fatal: false,
      },
    );

    const m3u8Url = resp?.data?.contentUrl;
    if (!m3u8Url) return [];

    // Domand hlsbid 必须带 access-rights 下发的 domand_bid，否则 CloudFront 403 Forbidden
    let domandCookie =
      this._downloader?.cookiejar?.getCookieHeader(m3u8Url) ||
      this._downloader?.cookiejar?.getCookieHeader('https://delivery.domand.nicovideo.jp/') ||
      '';
    if (!/domand_bid=/i.test(domandCookie)) {
      try {
        const { resolveCookieHeader } = await import('../cookies');
        const platform = await resolveCookieHeader(m3u8Url, { usePlatformJar: true });
        if (platform) {
          domandCookie = domandCookie
            ? `${domandCookie}; ${platform}`
            : platform;
        }
      } catch {
        /* ignore */
      }
    }

    const domandHeaders: Record<string, string> = {
      Accept: '*/*',
      Origin: NiconicoIE.BASE_URL,
      Referer: `${NiconicoIE.BASE_URL}/`,
      'User-Agent': UA,
    };
    if (domandCookie) domandHeaders.Cookie = domandCookie;

    let rawFmts: Format[] = [];
    try {
      rawFmts = await this._extract_m3u8_formats(
        m3u8Url,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
        { headers: domandHeaders },
      );
    } catch {
      rawFmts = [];
    }

    // 展开失败时仍返回 master（下载器带同一套 headers），避免 probe 直接失败
    if (!rawFmts.length) {
      return [
        {
          format_id: 'domand-hls',
          url: m3u8Url,
          ext: 'mp4',
          protocol: 'm3u8_native',
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: domandHeaders,
        },
      ];
    }

    const formats: Format[] = [];
    for (const aFmt of rawFmts.filter((f) => f.vcodec === 'none')) {
      const matchAudio = audios.find((a) =>
        String(aFmt.format_id || '').startsWith(String(a.id)),
      );
      formats.push({
        ...aFmt,
        abr: matchAudio?.bitRate != null ? Number(matchAudio.bitRate) / 1000 : aFmt.abr,
        asr: matchAudio?.samplingRate != null ? Number(matchAudio.samplingRate) : aFmt.asr,
        format_id: matchAudio?.id != null ? String(matchAudio.id) : aFmt.format_id,
        quality: matchAudio?.qualityLevel != null ? Number(matchAudio.qualityLevel) : aFmt.quality,
        acodec: 'aac',
        http_headers: { ...(aFmt.http_headers || {}), ...domandHeaders },
      });
    }

    const vFmts = this._remove_duplicate_formats(
      [...rawFmts.filter((f) => f.vcodec !== 'none')].sort(
        (a, b) => (Number(a.tbr) || 0) - (Number(b.tbr) || 0),
      ),
    );
    const minAbr =
      Math.min(
        ...audios
          .map((a) => (a.bitRate != null ? Number(a.bitRate) / 1000 : NaN))
          .filter((n) => Number.isFinite(n)),
      ) || 0;
    for (const vFmt of vFmts) {
      try {
        if (vFmt.url) {
          const base = new URL(vFmt.url).pathname.split('/').pop() || '';
          vFmt.format_id = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
        }
      } catch {
        /* keep */
      }
      const matchVideo = videos.find((v) => String(v.id) === String(vFmt.format_id));
      vFmt.quality =
        matchVideo?.qualityLevel != null ? Number(matchVideo.qualityLevel) : vFmt.quality ?? -1;
      if (vFmt.tbr != null && minAbr > 0) vFmt.tbr = Number(vFmt.tbr) - minAbr;
      vFmt.http_headers = { ...(vFmt.http_headers || {}), ...domandHeaders };
      formats.push(vFmt);
    }

    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    if (!videoId) throw new ExtractorError('Unable to extract niconico id', { expected: true });

    // 对齐 yt-dlp：走 /api/watch/v3_guest|v3，不再依赖网页 data-api-data
    const path = this.isLoggedIn ? 'v3' : 'v3_guest';
    const actionTrackId = `AAAAAAAAAA_${Math.round(Date.now())}`;
    const apiResp = await this._download_json<{
      data?: Record<string, unknown>;
      meta?: { status?: number; errorCode?: string };
    }>(
      `${NiconicoIE.BASE_URL}/api/watch/${path}/${videoId}`,
      videoId,
      'Downloading niconico API JSON',
      {
        headers: {
          ...NiconicoIE.NICO_HEADERS,
          ...this.geo_verification_headers(),
          Referer: `${NiconicoIE.BASE_URL}/`,
          'User-Agent': UA,
        },
        query: { actionTrackId },
        fatal: false,
      },
    );

    const apiData = (apiResp?.data || {}) as Record<string, unknown>;
    const status = Number(apiResp?.meta?.status ?? 0);
    const scheduledTime =
      apiData.publishScheduledAt != null ? String(apiData.publishScheduledAt) : '';

    if (status && status !== 200) {
      const errCode = String(apiResp?.meta?.errorCode || '').toUpperCase();
      const reasonCode =
        apiData.reasonCode != null ? String(apiData.reasonCode) : undefined;
      let errMsg =
        NiconicoIE.ERROR_MAP[errCode]?.[reasonCode || ''] ||
        NiconicoIE.ERROR_MAP[errCode]?.DEFAULT;

      if (reasonCode === 'DOMESTIC_VIDEO' || reasonCode === 'HIGH_RISK_COUNTRY_VIDEO') {
        this.raise_geo_restricted('This video is only available in Japan', ['JP']);
      }
      if (
        reasonCode === 'HARMFUL_VIDEO' &&
        (apiData.viewer as Record<string, unknown> | undefined)?.allowSensitiveContents === false
      ) {
        errMsg = 'Sensitive content, adjust display settings to watch';
      } else if (reasonCode === 'HIDDEN_VIDEO' && scheduledTime) {
        errMsg = `This content is scheduled to be released at ${scheduledTime}`;
      } else if (
        reasonCode &&
        ['CHANNEL_MEMBER_ONLY', 'HARMFUL_VIDEO', 'HIDDEN_VIDEO', 'PPV_VIDEO', 'PREMIUM_ONLY'].includes(
          reasonCode,
        )
      ) {
        this.raise_login_required(errMsg || reasonCode);
      }

      if (errMsg) throw new ExtractorError(errMsg, { expected: true });
      if (status >= 500) {
        throw new ExtractorError('Service temporarily unavailable', { expected: true });
      }
      throw new ExtractorError(`niconico API error status ${status}`, { expected: true });
    }

    if (!apiData || !Object.keys(apiData).length) {
      throw new ExtractorError('Unable to fetch niconico watch API data', { expected: true });
    }

    const paymentVideo =
      ((apiData.payment as Record<string, unknown> | undefined)?.video as Record<
        string,
        unknown
      >) || {};
    const availability = this._availability({
      needs_auth: Boolean(paymentVideo.isContinuationBenefit || paymentVideo.isPpv),
      needs_subscription: Boolean(paymentVideo.isAdmission),
      needs_premium: Boolean(paymentVideo.isPremium),
    });

    let formats = await this.extractDomandFormats(apiData, videoId);
    if (!formats.length) {
      const statusMsg: Record<string, string> = {
        needs_auth: 'PPV video, payment information required',
        premium_only: 'Premium members only',
        subscriber_only: 'Channel members only',
      };
      const msg = availability ? statusMsg[availability] : undefined;
      if (msg) this.raise_login_required(msg);
      throw new ExtractorError(
        '无法提取 niconico 播放地址（可能需登录、地区限制或 delivery 会话失败）',
        { expected: true },
      );
    }

    formats = this._sort_formats(formats);

    const video = (apiData.video as Record<string, unknown>) || {};
    const count = (video.count as Record<string, unknown>) || {};
    const owner =
      (apiData.channel as Record<string, unknown>) ||
      (apiData.owner as Record<string, unknown>) ||
      {};
    const thumb = (video.thumbnail as Record<string, unknown>) || {};
    const thumbnail =
      String(thumb.player || thumb.ogp || thumb.largeUrl || thumb.middleUrl || thumb.url || '') ||
      undefined;
    const tags = Array.isArray((apiData.tag as Record<string, unknown> | undefined)?.items)
      ? ((apiData.tag as Record<string, unknown>).items as Array<Record<string, unknown>>)
          .map((t) => String(t.name || ''))
          .filter(Boolean)
      : undefined;
    const genreLabel = (apiData.genre as Record<string, unknown> | undefined)?.label;
    const registeredAt = video.registeredAt != null ? String(video.registeredAt) : '';
    const timestamp = registeredAt ? Math.floor(Date.parse(registeredAt) / 1000) : null;

    return {
      id: String(video.id || videoId),
      display_id: videoId,
      title: String(video.title || videoId),
      description: video.description != null ? decodeHtml(String(video.description)) : null,
      duration: Number(video.duration) || null,
      timestamp,
      thumbnail,
      uploader: String(owner.name || owner.nickname || '') || null,
      uploader_id: owner.id != null ? String(owner.id) : null,
      channel: String(owner.name || owner.nickname || '') || null,
      channel_id: owner.id != null ? String(owner.id) : null,
      view_count: Number(count.view) || null,
      comment_count: Number(count.comment) || null,
      like_count: Number(count.like) || null,
      tags,
      genres: genreLabel ? [String(genreLabel)] : undefined,
      availability: availability || 'public',
      webpage_url: `${NiconicoIE.BASE_URL}/watch/${videoId}`,
      original_url: url,
      formats,
      extractor: 'niconico',
      extractor_key: 'Niconico',
      http_headers: {
        Accept: '*/*',
        Origin: NiconicoIE.BASE_URL,
        Referer: `${NiconicoIE.BASE_URL}/`,
        'User-Agent': UA,
        ...(formats[0]?.http_headers?.Cookie
          ? { Cookie: formats[0].http_headers.Cookie }
          : {}),
      },
    };
  }
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
