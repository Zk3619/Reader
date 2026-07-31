/**
 * TikTokIE — 精简：网页 __UNIVERSAL_DATA__ / SIGI_STATE 抽直链。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

export class TikTokIE extends InfoExtractor {
  static IE_NAME = 'tiktok';
  static IE_DESC = 'TikTok';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/(?:@[\w.-]+\/video\/|v\/|t\/)?(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    let pageUrl = url;
    // 短链跟跳转
    if (/vm\.tiktok\.com|\/t\//i.test(url)) {
      const html = await this._download_webpage(url, 'tiktok', 'Resolving short link', {
        fatal: false,
      });
      const m = html?.match(/https?:\/\/www\.tiktok\.com\/@[^"' ]+\/video\/\d+/);
      if (m) pageUrl = m[0];
    }

    const id =
      this._match_id(pageUrl) ||
      pageUrl.match(/video\/(\d+)/)?.[1] ||
      pageUrl.match(/\/([\w-]{5,})\/?$/)?.[1];
    if (!id) throw new ExtractorError('Unable to extract TikTok id', { expected: true });

    const webpage = await this._download_webpage(
      pageUrl.includes('tiktok.com') ? pageUrl : `https://www.tiktok.com/@/video/${id}`,
      id,
      'Downloading TikTok webpage',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.tiktok.com/',
        },
      },
    );

    const detail = extractTikTokDetail(webpage || '');
    if (!detail) {
      throw new ExtractorError('Unable to extract TikTok video detail', { expected: true });
    }

    const video = (detail.video || {}) as Record<string, unknown>;
    const formats: Format[] = [];
    const push = (u: string | undefined, fid: string, note?: string) => {
      if (!u) return;
      formats.push({
        format_id: fid,
        url: u,
        ext: 'mp4',
        protocol: 'https',
        format_note: note,
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: {
          Referer: 'https://www.tiktok.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
    };

    push(String(video.playAddr || video.downloadAddr || '') || undefined, 'play');
    const bitrateInfo = (video.bitrateInfo as Record<string, unknown>[]) || [];
    bitrateInfo.forEach((b, i) => {
      const addr = (b.PlayAddr as Record<string, unknown>)?.UrlList as string[] | undefined;
      push(addr?.[0], `br-${i}`, String(b.GearName || ''));
    });

    if (!formats.length) {
      throw new ExtractorError('No TikTok media URL', { expected: true });
    }

    const author = (detail.author || {}) as Record<string, unknown>;
    const title = String(detail.desc || detail.description || `tiktok-${id}`);

    return {
      id: String(detail.id || id),
      title,
      description: title,
      uploader: String(author.nickname || author.uniqueId || '') || null,
      webpage_url: pageUrl,
      original_url: url,
      formats,
      thumbnail: String(video.cover || video.originCover || '') || undefined,
      extractor: 'tiktok',
      extractor_key: 'TikTok',
      duration: Number(video.duration) || null,
    };
  }
}

function extractTikTokDetail(html: string): Record<string, unknown> | null {
  const uni = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/,
  );
  if (uni?.[1]) {
    try {
      const json = JSON.parse(uni[1]) as Record<string, unknown>;
      const def = (json['__DEFAULT_SCOPE__'] || {}) as Record<string, unknown>;
      const detail =
        (def['webapp.video-detail'] as Record<string, unknown>)?.itemInfo as
          | Record<string, unknown>
          | undefined;
      const item = detail?.itemStruct as Record<string, unknown> | undefined;
      if (item) return item;
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
        if (first) return first;
      }
    } catch {
      /* */
    }
  }
  return null;
}
