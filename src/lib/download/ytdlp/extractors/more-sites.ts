/**
 * Douyin / Instagram / Reddit / Niconico — 高价值站点精简实现。
 * Bangumi 已拆到 bilibili-bangumi.ts。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { extractJsonAssign } from './bilibili-shared';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Align with yt-dlp TikTokBaseIE._parse_aweme_video_app format extraction. */
function parseAwemeFormats(
  detail: Record<string, unknown>,
  headers: Record<string, string>,
): Format[] {
  const video = (detail.video || {}) as Record<string, unknown>;
  const formats: Format[] = [];
  const seen = new Set<string>();

  const pushAddr = (
    addr: Record<string, unknown> | undefined,
    meta: Partial<Format> & { format_id: string },
  ) => {
    if (!addr) return;
    const list = addr.url_list;
    const urls = Array.isArray(list)
      ? list.map(String)
      : typeof list === 'string'
        ? [list]
        : [];
    for (const u of urls) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      formats.push({
        url: u,
        ext: 'mp4',
        protocol: 'https',
        acodec: 'aac',
        filesize: Number(addr.data_size) || null,
        width: Number(addr.width || meta.width) || null,
        height: Number(addr.height || meta.height) || null,
        http_headers: headers,
        ...meta,
      });
    }
  };

  const width = Number(video.width) || null;
  const height = Number(video.height) || null;
  const isH265 = Boolean(video.is_bytevc1 || video.is_h265);

  pushAddr(video.play_addr as Record<string, unknown> | undefined, {
    format_id: 'play_addr',
    format_note: 'Direct video',
    vcodec: isH265 ? 'h265' : 'h264',
    width,
    height,
  });
  pushAddr(video.download_addr as Record<string, unknown> | undefined, {
    format_id: 'download_addr',
    format_note: video.has_watermark ? 'Download video, watermarked' : 'Download video',
    vcodec: 'h264',
    width: Number((video.download_addr as Record<string, unknown>)?.width) || width,
    height,
  });
  pushAddr(video.play_addr_h264 as Record<string, unknown> | undefined, {
    format_id: 'play_addr_h264',
    format_note: 'Direct video',
    vcodec: 'h264',
  });
  pushAddr(video.play_addr_bytevc1 as Record<string, unknown> | undefined, {
    format_id: 'play_addr_bytevc1',
    format_note: 'Direct video',
    vcodec: 'h265',
  });

  const bitRate = (video.bit_rate as Record<string, unknown>[]) || [];
  for (const b of bitRate) {
    const brH265 = Boolean(b.is_bytevc1 || b.is_h265);
    pushAddr(b.play_addr as Record<string, unknown> | undefined, {
      format_id: String(b.gear_name || `br-${formats.length}`),
      format_note: 'Playback video',
      vcodec: brH265 ? 'h265' : 'h264',
      tbr: b.bit_rate != null ? Number(b.bit_rate) / 1000 : null,
      fps: Number(b.FPS || b.fps) || null,
    });
  }

  // Music-only fallback (upstream)
  if (!formats.length) {
    const music = (detail.music || {}) as Record<string, unknown>;
    const playUrl = String(music.play_url?.toString?.() || music.playUrl || '');
    const musicList = (music.play_url as Record<string, unknown>)?.url_list;
    const mu =
      (Array.isArray(musicList) && String(musicList[0] || '')) ||
      (typeof music.playUrl === 'string' ? music.playUrl : '') ||
      playUrl;
    if (mu && mu.startsWith('http')) {
      formats.push({
        format_id: 'music',
        url: mu,
        ext: 'mp3',
        protocol: 'https',
        vcodec: 'none',
        acodec: 'mp3',
        format_note: 'Music track',
        http_headers: headers,
      });
    }
  }

  return formats;
}

export class DouyinIE extends InfoExtractor {
  static IE_NAME = 'Douyin';
  static IE_DESC = '抖音';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?douyin\.com\/(?:video|note)\/(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://www.douyin.com/video/6961737553342991651', only_matching: true },
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Douyin id', { expected: true });

    const headers = {
      Referer: 'https://www.douyin.com/',
      'User-Agent': UA,
    };

    // Upstream DouyinIE: aweme/v1/web/aweme/detail
    const detailJson = await this._download_json<{
      aweme_detail?: Record<string, unknown>;
      status_code?: number;
    }>(
      `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}&device_platform=webapp&aid=6383`,
      id,
      'Downloading Douyin web detail JSON',
      { headers, fatal: false },
    );

    let detail = detailJson?.aweme_detail as Record<string, unknown> | undefined;
    if (!detail) {
      const webpage = await this._download_webpage(url, id, 'Downloading Douyin webpage', {
        headers,
        fatal: false,
      });
      detail = extractDouyinDetail(webpage || '') || undefined;
    }
    if (!detail) {
      throw new ExtractorError(
        'Fresh cookies (not necessarily logged in) are needed for Douyin (s_v_web_id)',
        { expected: true },
      );
    }

    const formats = parseAwemeFormats(detail, headers);
    if (!formats.length) throw new ExtractorError('No Douyin media URL', { expected: true });

    const video = (detail.video || {}) as Record<string, unknown>;
    const author = (detail.author || {}) as Record<string, unknown>;
    const stats = (detail.statistics || {}) as Record<string, unknown>;
    const music = (detail.music || {}) as Record<string, unknown>;
    const desc = String(detail.desc || detail.preview_title || id);
    const durRaw = Number(video.duration || detail.duration || music.duration) || 0;
    const duration = durRaw > 1000 ? durRaw / 1000 : durRaw || null;

    const cover =
      ((video.cover || video.origin_cover) as Record<string, unknown>)?.url_list;
    const thumb = Array.isArray(cover) ? String(cover[0] || '') : '';

    return {
      id: String(detail.aweme_id || id),
      title: desc.length > 72 ? desc.slice(0, 72) : desc,
      description: desc,
      duration,
      timestamp: Number(detail.create_time) || null,
      uploader: String(author.unique_id || author.nickname || '') || undefined,
      uploader_id: author.uid != null ? String(author.uid) : null,
      channel: String(author.nickname || '') || null,
      channel_id: String(author.sec_uid || '') || null,
      view_count: Number(stats.play_count) || null,
      like_count: Number(stats.digg_count) || null,
      comment_count: Number(stats.comment_count) || null,
      thumbnail: thumb || undefined,
      webpage_url: `https://www.douyin.com/video/${id}`,
      original_url: url,
      formats,
      extractor: 'Douyin',
      extractor_key: 'Douyin',
      http_headers: headers,
    };
  }
}

function extractDouyinDetail(webpage: string): Record<string, unknown> | null {
  const patterns = [
    /<script[^>]*id="RENDER_DATA"[^>]*>([^<]+)<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m?.[1]) continue;
    try {
      let raw = m[1];
      if (re.source.includes('RENDER_DATA')) {
        raw = decodeURIComponent(raw);
      }
      const data = JSON.parse(raw) as Record<string, unknown>;
      const detail =
        findAwemeDetail(data) ||
        ((data as { aweme?: { detail?: Record<string, unknown> } }).aweme?.detail);
      if (detail) return detail;
    } catch {
      /* continue */
    }
  }
  return null;
}

function findAwemeDetail(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (!obj || depth > 8) return null;
  if (typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  if (rec.aweme_detail && typeof rec.aweme_detail === 'object') {
    return rec.aweme_detail as Record<string, unknown>;
  }
  if (rec.awemeId && rec.video) return rec;
  for (const v of Object.values(rec)) {
    const hit = findAwemeDetail(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

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

    // GraphQL shortcode media (main path when cookies present)
    const gql = await this._download_json<{
      data?: { xdt_shortcode_media?: Record<string, unknown> | null };
      items?: Array<Record<string, unknown>>;
    }>(
      `https://www.instagram.com/api/v1/media/${id}/info/`,
      id,
      'Downloading Instagram media info',
      { headers, fatal: false },
    ).catch(() => null);

    let media =
      gql?.items?.[0] ||
      (gql?.data?.xdt_shortcode_media as Record<string, unknown> | undefined);

    const webpage = await this._download_webpage(
      `https://www.instagram.com/p/${id}/`,
      id,
      'Downloading Instagram webpage',
      { headers, fatal: false },
    );

    if (!media && webpage) {
      const shared = extractJsonAssign(webpage, /window\._sharedData\s*=/) ||
        extractJsonAssign(webpage, /"xdt_api__v1__media__shortcode__web_info"/);
      media = findIgMedia(shared || webpage) || undefined;
    }

    const formats: Format[] = [];
    const push = (u: string | undefined, fid: string) => {
      if (!u) return;
      formats.push({
        format_id: fid,
        url: u,
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: headers,
      });
    };

    if (media) {
      push(String(media.video_url || '') || undefined, 'video');
      const versions = (media.video_versions as Array<{ url?: string }>) || [];
      versions.forEach((v, i) => push(v.url, `v${i}`));
      const carousel = (media.carousel_media || media.edge_sidecar_to_children) as
        | Array<Record<string, unknown>>
        | { edges?: Array<{ node?: Record<string, unknown> }> }
        | undefined;
      const nodes = Array.isArray(carousel)
        ? carousel
        : (carousel?.edges || []).map((e) => e.node!).filter(Boolean);
      nodes.forEach((n, i) => {
        push(String(n.video_url || '') || undefined, `carousel-${i}`);
        const vv = (n.video_versions as Array<{ url?: string }>) || [];
        vv.forEach((v, j) => push(v.url, `carousel-${i}-${j}`));
      });
    }

    if (!formats.length && webpage) {
      const og = webpage.match(
        /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)/i,
      );
      push(og?.[1], 'og');
      for (const mm of webpage.matchAll(/"video_url"\s*:\s*"([^"]+)"/g)) {
        push(mm[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/'), 'json');
      }
    }

    if (!formats.length) {
      this.raise_login_required(
        'Instagram requires cookies for many posts (login or sessionid)',
      );
    }

    const title =
      String(media?.caption || (media?.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> })?.edges?.[0]?.node?.text || id);

    return {
      id,
      title,
      webpage_url: `https://www.instagram.com/p/${id}/`,
      original_url: url,
      formats,
      extractor: 'Instagram',
      extractor_key: 'Instagram',
      http_headers: headers,
    };
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
