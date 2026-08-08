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

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract niconico id', { expected: true });

    const headers = { 'User-Agent': UA, Referer: 'https://www.nicovideo.jp/' };
    const webpage = await this._download_webpage(
      `https://www.nicovideo.jp/watch/${id}`,
      id,
      'Downloading niconico webpage',
      { headers },
    );

    const apiData =
      extractJsonAssign(webpage, /data-api-data="/) ||
      extractNicoApiDataAttr(webpage) ||
      extractJsonAssign(webpage, /server-response/);

    const video = (apiData?.video || apiData?.media || apiData || {}) as Record<string, unknown>;
    const title = String(
      (video as { title?: string }).title ||
        webpage.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ||
        id,
    );

    const formats: Format[] = [];
    const m3u8Matches = [
      ...webpage.matchAll(/https?:\\\/\\\/[^\s"']+\.m3u8[^\s"']*/g),
      ...webpage.matchAll(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g),
    ];
    for (const mm of m3u8Matches) {
      const u = mm[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
      formats.push({
        format_id: 'hls',
        url: u,
        ext: 'mp4',
        protocol: 'm3u8_native',
        vcodec: 'unknown',
        acodec: 'unknown',
        http_headers: headers,
      });
      break;
    }

    const smile = webpage.match(/https?:\/\/[^\s"']*smile-video[^\s"']*/);
    if (smile) {
      formats.push({
        format_id: 'smile',
        url: smile[0].replace(/&amp;/g, '&'),
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: headers,
      });
    }

    if (!formats.length) {
      const delivery = await tryNiconicoDelivery(this, id, apiData, headers);
      formats.push(...delivery);
    }

    if (!formats.length) {
      throw new ExtractorError(
        '无法提取 niconico 播放地址（可能需登录或新版 delivery 会话）',
        { expected: true },
      );
    }

    return {
      id,
      title: decodeHtml(title),
      webpage_url: `https://www.nicovideo.jp/watch/${id}`,
      original_url: url,
      formats,
      extractor: 'Niconico',
      extractor_key: 'Niconico',
      http_headers: headers,
    };
  }
}

function extractNicoApiDataAttr(webpage: string): Record<string, unknown> | null {
  const m = webpage.match(/data-api-data="([^"]+)"/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(decodeHtml(m[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function tryNiconicoDelivery(
  ie: InfoExtractor,
  id: string,
  apiData: Record<string, unknown> | null,
  headers: Record<string, string>,
): Promise<Format[]> {
  if (!apiData) return [];
  const media = (apiData.media as Record<string, unknown>) || {};
  const domand = (media.domand as Record<string, unknown>) || {};
  const accessRightKey = String(domand.accessRightKey || '');
  const videos = (domand.videos as Array<Record<string, unknown>>) || [];
  const audios = (domand.audios as Array<Record<string, unknown>>) || [];
  if (!accessRightKey || !videos.length) return [];

  const videoId = String(videos[0]?.id || '');
  const audioId = String(audios[0]?.id || '');
  if (!videoId) return [];

  const watchTrackId = String(
    ((apiData.client as Record<string, unknown>)?.watchTrackId as string) || 'NicoGoogle_0',
  );

  const resp = await ie._download_json<{
    data?: { contentUrl?: string };
    meta?: { status?: number };
  }>(
    `https://nvapi.nicovideo.jp/v1/watch/${id}/access-rights/hls?actionTrackId=${encodeURIComponent(watchTrackId)}`,
    id,
    'Creating niconico HLS session',
    {
      method: 'POST',
      headers: {
        ...headers,
        'X-Access-Right-Key': accessRightKey,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        outputs: [[videoId, audioId].filter(Boolean)],
      }),
      fatal: false,
    },
  );

  const contentUrl = resp?.data?.contentUrl;
  if (!contentUrl) return [];
  return [
    {
      format_id: 'domand-hls',
      url: contentUrl,
      ext: 'mp4',
      protocol: 'm3u8_native',
      vcodec: 'unknown',
      acodec: 'unknown',
      http_headers: headers,
    },
  ];
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
