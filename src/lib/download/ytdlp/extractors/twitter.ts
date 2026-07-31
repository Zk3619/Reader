/**
 * TwitterIE / X — 精简移植：syndication / embed 直链 + guest token 尝试。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const AUTH =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export class TwitterIE extends InfoExtractor {
  static IE_NAME = 'twitter';
  static IE_DESC = 'Twitter / X';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m(?:obile)?)\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract tweet id', { expected: true });

    // 1) syndication CDN（无需登录，覆盖多数公开带媒体推文）
    const synUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=x`;
    let data: Record<string, unknown> | null = null;
    try {
      data = await this._download_json<Record<string, unknown>>(
        synUrl,
        id,
        'Downloading syndication tweet',
        { fatal: false, headers: { Referer: 'https://x.com/' } },
      );
    } catch {
      data = null;
    }

    // 2) guest token + legacy show.json
    if (!data || !(data.mediaDetails || data.video)) {
      try {
        const guest = await this._download_json<{ guest_token?: string }>(
          'https://api.x.com/1.1/guest/activate.json',
          id,
          'Activating guest',
          {
            method: 'POST',
            headers: { Authorization: AUTH },
            data: '{}',
            fatal: false,
          },
        );
        const token = guest?.guest_token;
        if (token) {
          data = await this._download_json<Record<string, unknown>>(
            `https://api.x.com/1.1/statuses/show/${id}.json?include_entities=true&tweet_mode=extended`,
            id,
            'Downloading tweet API',
            {
              fatal: false,
              headers: {
                Authorization: AUTH,
                'x-guest-token': token,
              },
            },
          );
        }
      } catch {
        /* */
      }
    }

    if (!data) throw new ExtractorError('Unable to fetch tweet', { expected: true });

    const formats = collectTwitterFormats(data);
    if (!formats.length) {
      throw new ExtractorError('Tweet has no downloadable video', { expected: true });
    }

    const title =
      String(
        data.full_text ||
          data.text ||
          (data.user as Record<string, unknown>)?.name ||
          `tweet-${id}`,
      ).slice(0, 200) || `tweet-${id}`;

    return {
      id,
      title,
      webpage_url: `https://x.com/i/status/${id}`,
      original_url: url,
      formats,
      extractor: 'twitter',
      extractor_key: 'Twitter',
      thumbnail: formats[0]?.url,
      http_headers: { Referer: 'https://x.com/' },
    };
  }
}

function collectTwitterFormats(data: Record<string, unknown>): Format[] {
  const out: Format[] = [];
  const pushVariant = (v: Record<string, unknown>, prefix: string) => {
    const u = String(v.url || '');
    if (!u) return;
    const br = Number(v.bitrate || v.bit_rate) || 0;
    out.push({
      format_id: `${prefix}-${br || out.length}`,
      url: u,
      ext: u.includes('.m3u8') ? 'mp4' : 'mp4',
      protocol: u.includes('.m3u8') ? 'm3u8_native' : 'https',
      tbr: br ? Math.round(br / 1000) : null,
      vcodec: u.includes('.m3u8') ? 'unknown' : 'unknown',
      acodec: 'unknown',
    });
  };

  const mediaDetails = (data.mediaDetails as Record<string, unknown>[]) || [];
  for (const m of mediaDetails) {
    const videoInfo = m.video_info as Record<string, unknown> | undefined;
    const variants = (videoInfo?.variants as Record<string, unknown>[]) || [];
    for (const v of variants) {
      if (String(v.content_type || '').includes('mp4') || String(v.url || '').includes('.m3u8')) {
        pushVariant(v, 'http');
      }
    }
  }

  const entities = (data.extended_entities || data.entities) as Record<string, unknown> | undefined;
  const media = (entities?.media as Record<string, unknown>[]) || [];
  for (const m of media) {
    const videoInfo = m.video_info as Record<string, unknown> | undefined;
    const variants = (videoInfo?.variants as Record<string, unknown>[]) || [];
    for (const v of variants) {
      if (String(v.content_type || '').includes('mp4') || String(v.url || '').includes('m3u8')) {
        pushVariant(v, 'api');
      }
    }
  }

  // syndication video shape
  const video = data.video as Record<string, unknown> | undefined;
  const variants2 = (video?.variants as Record<string, unknown>[]) || [];
  for (const v of variants2) pushVariant(v, 'syn');

  return out;
}
