/**
 * TikTokIE — web rehydration + aweme web API fallback, multi-format.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const WEB_HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.tiktok.com/',
};

function protoRelative(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function parseUrlKey(urlKey: string): Partial<Format> & { format_id?: string } {
  const m = /v[^_]+_(?<codec>[^_]+)_(?<res>\d+p)_(?<bitrate>\d+)/.exec(urlKey);
  if (!m?.groups) return {};
  const res = m.groups.res;
  const height = res ? Number(res.replace(/\D/g, '')) : null;
  const codec = m.groups.codec;
  return {
    format_id: `${codec}_${res}_${m.groups.bitrate}`,
    vcodec: codec === 'bytevc1' ? 'h265' : codec === 'bytevc2' ? 'bytevc2' : 'h264',
    tbr: Number(m.groups.bitrate) || null,
    height: height === 540 ? 576 : height,
    format_note: codec === 'bytevc2' ? 'UNPLAYABLE' : undefined,
    preference: codec === 'bytevc2' ? -100 : -1,
  };
}

function extractTikTokFromHtml(html: string): { detail: Record<string, unknown> | null; status: number } {
  const uni = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/,
  );
  if (uni?.[1]) {
    try {
      const json = JSON.parse(uni[1]) as Record<string, unknown>;
      const def = (json['__DEFAULT_SCOPE__'] || {}) as Record<string, unknown>;
      const block = (def['webapp.video-detail'] || {}) as Record<string, unknown>;
      const status = Number(block.statusCode) || 0;
      const item = (block.itemInfo as Record<string, unknown> | undefined)?.itemStruct as
        | Record<string, unknown>
        | undefined;
      if (item) return { detail: item, status };
      return { detail: null, status };
    } catch {
      /* */
    }
  }
  const sigi = html.match(/<script[^>]+id="SIGI_STATE"[^>]*>([^<]+)<\/script>/);
  if (sigi?.[1]) {
    try {
      const json = JSON.parse(sigi[1]) as Record<string, unknown>;
      const itemModule = json.ItemModule as Record<string, Record<string, unknown>> | undefined;
      if (itemModule) {
        const first = Object.values(itemModule)[0];
        if (first) return { detail: first, status: 0 };
      }
    } catch {
      /* */
    }
  }
  return { detail: null, status: 0 };
}

function extractWebFormats(detail: Record<string, unknown>): Format[] {
  const formats: Format[] = [];
  const seen = new Set<string>();
  const video = (detail.video || {}) as Record<string, unknown>;
  const playWidth = Number(video.width) || null;
  const playHeight = Number(video.height) || null;
  const ratio = playWidth && playHeight ? playWidth / playHeight : 0.5625;

  const push = (u: string | undefined, meta: Partial<Format> = {}) => {
    if (!u) return;
    const url = protoRelative(u);
    if (seen.has(url)) return;
    seen.add(url);
    formats.push({
      format_id: meta.format_id || `fmt-${formats.length}`,
      url,
      ext: meta.ext || 'mp4',
      protocol: url.includes('.m3u8') ? 'm3u8_native' : 'https',
      vcodec: meta.vcodec ?? 'h264',
      acodec: meta.acodec ?? 'aac',
      http_headers: WEB_HEADERS,
      ...meta,
    });
  };

  for (const b of (video.bitrateInfo as Record<string, unknown>[]) || []) {
    const playAddr = b.PlayAddr as Record<string, unknown> | undefined;
    const urlKey = String(playAddr?.UrlKey || '');
    const meta = parseUrlKey(urlKey);
    const urls = (playAddr?.UrlList as string[]) || [];
    const height = meta.height;
    let width = playWidth;
    let fmtHeight = playHeight;
    if (height && ratio) {
      if (ratio < 1) {
        width = height;
        fmtHeight = Math.round(height / ratio) - (Math.round(height / ratio) % 2);
      } else {
        width = Math.round(height * ratio) + (Math.round(height * ratio) % 2);
        fmtHeight = height;
      }
    }
    for (const u of urls) {
      push(u, {
        ...meta,
        width,
        height: fmtHeight,
        filesize: Number(playAddr?.DataSize) || undefined,
        format_note: String(b.GearName || meta.format_note || ''),
      });
    }
  }

  const playAddrRaw = video.playAddr;
  const playUrls: string[] = [];
  if (typeof playAddrRaw === 'string') playUrls.push(playAddrRaw);
  else if (playAddrRaw && typeof playAddrRaw === 'object') {
    const pa = playAddrRaw as Record<string, unknown>;
    if (typeof pa.src === 'string') playUrls.push(pa.src);
    for (const u of (pa.UrlList as string[]) || []) playUrls.push(u);
  }
  for (const u of playUrls) {
    push(u, { format_id: 'play', width: playWidth, height: playHeight });
  }

  const downloadRaw = video.downloadAddr ?? (video.download as Record<string, unknown> | undefined)?.url;
  const downloadUrls = typeof downloadRaw === 'string' ? [downloadRaw] : [];
  for (const u of downloadUrls) {
    push(u, { format_id: 'download', format_note: 'watermarked', preference: -2 });
  }

  if (!formats.length) {
    const music = (detail.music || {}) as Record<string, unknown>;
    const audioUrl = String(music.playUrl || '');
    if (audioUrl) {
      push(audioUrl, {
        format_id: 'audio',
        ext: audioUrl.includes('mp3') ? 'mp3' : 'm4a',
        vcodec: 'none',
        acodec: 'aac',
      });
    }
  }

  return formats;
}

export class TikTokIE extends InfoExtractor {
  static IE_NAME = 'tiktok';
  static IE_DESC = 'TikTok';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/(?:@[\w.-]+\/video\/|v\/|t\/|embed\/v2\/|embed\/)?(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    let pageUrl = url;
    if (/vm\.tiktok\.com|\/t\//i.test(url)) {
      const html = await this._download_webpage(url, 'tiktok', 'Resolving short link', {
        fatal: false,
        headers: WEB_HEADERS,
      });
      const m = html?.match(/https?:\/\/www\.tiktok\.com\/@[^"' ]+\/video\/\d+/);
      if (m) pageUrl = m[0];
    }

    const numericId = pageUrl.match(/video\/(\d+)/)?.[1];
    const id =
      numericId ||
      this._match_id(pageUrl) ||
      pageUrl.match(/\/([\w-]{5,})\/?$/)?.[1];
    if (!id) throw new ExtractorError('Unable to extract TikTok id', { expected: true });

    const canonicalUrl = numericId
      ? pageUrl.includes('tiktok.com')
        ? pageUrl.replace(/\?.*$/, '')
        : `https://www.tiktok.com/@_/video/${numericId}`
      : pageUrl;

    let detail: Record<string, unknown> | null = null;
    let status = 0;

    const webpage = await this._download_webpage(canonicalUrl, id, 'Downloading TikTok webpage', {
      headers: WEB_HEADERS,
    });
    ({ detail, status } = extractTikTokFromHtml(webpage || ''));

    // aweme web API fallback (upstream path when page lacks video data)
    if (!detail?.video && numericId) {
      const aweme = await this._download_json<{
        aweme_detail?: Record<string, unknown>;
        status_code?: number;
      }>(
        `https://www.tiktok.com/aweme/v1/web/aweme/detail/?aweme_id=${numericId}&device_platform=webapp&aid=1988`,
        id,
        'Downloading aweme web detail',
        { headers: WEB_HEADERS, fatal: false },
      );
      if (aweme?.aweme_detail) {
        detail = aweme.aweme_detail;
        status = 0;
      } else if (aweme?.status_code) {
        status = aweme.status_code;
      }
    }

    if (status === 10216 || status === 10222) {
      this.raise_login_required(
        'You do not have permission to view this post. Log into an account that has access',
      );
    }
    if (status === 10204) {
      throw new ExtractorError('Your IP address is blocked from accessing this post', { expected: true });
    }

    if (!detail) {
      throw new ExtractorError(
        status ? `Video not available, status code ${status}` : 'Unable to extract TikTok video detail',
        { expected: true },
      );
    }

    const formats = extractWebFormats(detail);
    if (!formats.length) {
      throw new ExtractorError('No TikTok media URL', { expected: true });
    }

    const author = (detail.author || detail.authorInfo || {}) as Record<string, unknown>;
    const video = (detail.video || {}) as Record<string, unknown>;
    const title = String(detail.desc || detail.description || `tiktok-${id}`);

    return {
      id: String(detail.id || detail.aweme_id || numericId || id),
      title,
      description: title,
      uploader: String(author.nickname || author.uniqueId || author.author || '') || null,
      uploader_id: String(author.id || author.authorId || author.uid || '') || null,
      webpage_url: canonicalUrl,
      original_url: url,
      formats,
      thumbnail: String(video.cover || video.originCover || video.dynamicCover || '') || undefined,
      extractor: 'tiktok',
      extractor_key: 'TikTok',
      duration: Number(video.duration) || null,
      http_headers: WEB_HEADERS,
    };
  }
}
