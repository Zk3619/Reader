/**
 * CloudflareStreamIE — ported from yt-dlp cloudflarestream.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { jwtDecodePayload, extractM3u8FormatsAndSubtitles } from './_helpers';

const SUBDOMAIN_RE = '(?:(?:watch|iframe|customer-\\w+)\\.)?';
const DOMAIN_RE = '(?:cloudflarestream\\.com|(?:videodelivery|bytehighway)\\.net)';
const EMBED_RE = `(?:embed\\.|${SUBDOMAIN_RE})${DOMAIN_RE}/embed/[^/?#]+\\.js\\?(?:[^#]+&)?video=`;
const ID_RE = '[\\da-f]{32}|eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+';

export class CloudflareStreamIE extends InfoExtractor {
  static IE_NAME = 'cloudflarestream';
  static _VALID_URL = new RegExp(
    `https?://(?:${SUBDOMAIN_RE}(?<domain>${DOMAIN_RE})/|${EMBED_RE})(?<id>${ID_RE})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let videoId = m.groups!.id!;
    let domain = m.groups!.domain;
    if (domain !== 'bytehighway.net') domain = 'cloudflarestream.com';
    const baseUrl = `https://${domain}/${videoId}/`;
    if (videoId.includes('.')) {
      videoId = String((jwtDecodePayload(videoId) as { sub?: unknown }).sub ?? videoId);
    }
    const manifestBaseUrl = `${baseUrl}manifest/video.`;

    const formats: Format[] = [];
    const { formats: hlsFormats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `${manifestBaseUrl}m3u8`,
      videoId,
      'hls',
    );
    formats.push(...hlsFormats);
    const dashFormats = await this._extract_mpd_formats(`${manifestBaseUrl}mpd`, videoId, 'dash', undefined, false);
    formats.push(...dashFormats);

    return {
      id: videoId,
      title: videoId,
      thumbnail: `${baseUrl}thumbnails/thumbnail.jpg`,
      formats,
      subtitles,
    };
  }
}
