/**
 * TwitterIE / X — syndication / guest API / login-wall detection.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const AUTH =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const REFERER = 'https://x.com/';

function generateSyndicationToken(twid: string): string {
  const n = (Number(twid) / 1e15) * Math.PI;
  return n.toString(36).replace(/0|\./g, '');
}

function normalizeSyndicationStatus(status: Record<string, unknown>, twid: string): Record<string, unknown> {
  const media: Record<string, unknown>[] = [];
  const quoted = status.quoted_tweet as Record<string, unknown> | undefined;
  const sources = [status, quoted].filter(Boolean) as Record<string, unknown>[];
  for (const src of sources) {
    const details = (src.mediaDetails as Record<string, unknown>[]) || [];
    for (const detail of details) {
      media.push({
        ...detail,
        id_str: String(detail.id_str || detail.id || twid),
      });
    }
  }
  if (media.length) {
    status.extended_entities = { media };
  }
  return status;
}

function tweetLoginReason(data: Record<string, unknown>): string | null {
  const errors = data.errors as Array<{ message?: string; code?: number }> | undefined;
  if (errors?.length) {
    const msg = errors.map((e) => String(e.message || '')).join(', ');
    if (/not authorized|authenticate|login|protected|nsfw/i.test(msg)) return msg;
  }
  if (data.reason === 'Nsfw') return 'NSFW tweet requires authentication';
  if (data.reason === 'Protected') return 'You are not authorized to view this protected tweet';
  const text = String(data.full_text || data.text || '');
  if (/login to view|sign in to view|this account.*protected/i.test(text)) {
    return 'Login required to view this tweet';
  }
  return null;
}

export class TwitterIE extends InfoExtractor {
  static IE_NAME = 'twitter';
  static IE_DESC = 'Twitter / X';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|m(?:obile)?)\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract tweet id', { expected: true });

    let data: Record<string, unknown> | null = null;

    // 1) syndication CDN (public tweets, no login)
    const synToken = generateSyndicationToken(id);
    try {
      data = await this._download_json<Record<string, unknown>>(
        `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${synToken}`,
        id,
        'Downloading syndication tweet',
        {
          fatal: false,
          headers: { Referer: REFERER, 'User-Agent': 'Googlebot' },
        },
      );
      if (data) data = normalizeSyndicationStatus(data, id);
    } catch {
      data = null;
    }

    const loginReason = data ? tweetLoginReason(data) : null;
    if (loginReason) this.raise_login_required(loginReason);

    // 2) guest token + legacy show.json
    if (!data || !hasTwitterVideo(data)) {
      try {
        const guest = await this._download_json<{ guest_token?: string; errors?: unknown[] }>(
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
            `https://api.x.com/1.1/statuses/show/${id}.json?include_entities=true&tweet_mode=extended&cards_platform=Web-12`,
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
          const apiLogin = data ? tweetLoginReason(data) : null;
          if (apiLogin) this.raise_login_required(apiLogin);
        }
      } catch (e) {
        if (e instanceof ExtractorError && /login required/i.test(String(e.message))) throw e;
      }
    }

    if (!data) throw new ExtractorError('Unable to fetch tweet', { expected: true });

    const formats = await collectTwitterFormats(this, data, id);
    if (!formats.length) {
      throw new ExtractorError('Tweet has no downloadable video', { expected: true });
    }

    const user = (data.user as Record<string, unknown>) || {};
    const description = String(data.full_text || data.text || '');
    const uploader = String(user.name || '') || undefined;
    let title =
      String(description || user.name || `tweet-${id}`).slice(0, 200) || `tweet-${id}`;
    if (uploader && !title.startsWith(uploader)) title = `${uploader} - ${title}`;

    return {
      id,
      title,
      description: description || null,
      uploader,
      uploader_id: String(user.screen_name || '') || undefined,
      webpage_url: `https://x.com/i/status/${id}`,
      original_url: url,
      formats: this._sort_formats(formats),
      extractor: 'twitter',
      extractor_key: 'Twitter',
      thumbnail: formats[0]?.url,
      http_headers: { Referer: REFERER },
    };
  }
}

function hasTwitterVideo(data: Record<string, unknown>): boolean {
  if (data.video) return true;
  const mediaDetails = (data.mediaDetails as Record<string, unknown>[]) || [];
  if (mediaDetails.some((m) => m.video_info || m.type === 'video')) return true;
  const entities = (data.extended_entities || data.entities) as Record<string, unknown> | undefined;
  const media = (entities?.media as Record<string, unknown>[]) || [];
  return media.some((m) => m.video_info || m.type === 'video');
}

async function collectTwitterFormats(
  ie: InfoExtractor,
  data: Record<string, unknown>,
  videoId: string,
): Promise<Format[]> {
  const out: Format[] = [];
  const seen = new Set<string>();
  const headers = { Referer: REFERER };

  const pushVariant = async (v: Record<string, unknown>, prefix: string) => {
    const u = String(v.url || '');
    if (!u || seen.has(u)) return;
    seen.add(u);
    const br = Number(v.bitrate || v.bit_rate) || 0;
    if (u.includes('.m3u8')) {
      const fmts = await ie._extract_m3u8_formats(
        u,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        `${prefix}-hls`,
        undefined,
        false,
        { headers },
      );
      for (const f of fmts) {
        if (!f.tbr && br) f.tbr = Math.round(br / 1000);
        out.push(f);
      }
      if (!fmts.length) {
        out.push({
          format_id: `${prefix}-${br || out.length}`,
          url: u,
          ext: 'mp4',
          protocol: 'm3u8_native',
          tbr: br ? Math.round(br / 1000) : null,
          vcodec: 'unknown',
          acodec: 'unknown',
          http_headers: headers,
        });
      }
      return;
    }
    const fmt: Format = {
      format_id: `${prefix}-${br || out.length}`,
      url: u,
      ext: 'mp4',
      protocol: 'https',
      tbr: br ? Math.round(br / 1000) : null,
      vcodec: 'unknown',
      acodec: 'unknown',
      http_headers: headers,
    };
    const dim = /\/(\d+)x(\d+)\//.exec(u);
    if (dim) {
      fmt.width = Number(dim[1]);
      fmt.height = Number(dim[2]);
    }
    out.push(fmt);
  };

  const handleMedia = async (m: Record<string, unknown>, prefix: string) => {
    const videoInfo = m.video_info as Record<string, unknown> | undefined;
    const variants = (videoInfo?.variants as Record<string, unknown>[]) || [];
    for (const v of variants) {
      const ct = String(v.content_type || '');
      if (ct.includes('mp4') || ct.includes('mpegurl') || String(v.url || '').includes('.m3u8')) {
        await pushVariant(v, prefix);
      }
    }
  };

  const mediaDetails = (data.mediaDetails as Record<string, unknown>[]) || [];
  for (const m of mediaDetails) await handleMedia(m, 'syn');

  const entities = (data.extended_entities || data.entities) as Record<string, unknown> | undefined;
  const media = (entities?.media as Record<string, unknown>[]) || [];
  for (const m of media) await handleMedia(m, 'api');

  const video = data.video as Record<string, unknown> | undefined;
  const variants2 = (video?.variants as Record<string, unknown>[]) || [];
  for (const v of variants2) await pushVariant(v, 'syn');

  return out;
}
