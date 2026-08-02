/**
 * ArcPublishingIE — aligned with yt-dlp arcpublishing.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, try_get } from '../../utils';
import { parseIso8601 } from './helpers';

const UUID_REGEX = '[\\da-f]{8}-(?:[\\da-f]{4}-){3}[\\da-f]{12}';

const POWA_DEFAULTS: Array<[string[], string]> = [
  [['cmg', 'prisa'], '%s-config-prod.api.cdn.arcpublishing.com/video'],
  [
    [
      'adn', 'advancelocal', 'answers', 'bonnier', 'bostonglobe', 'demo',
      'gmg', 'gruponacion', 'infobae', 'mco', 'nzme', 'pmn', 'raycom',
      'spectator', 'tbt', 'tgam', 'tronc', 'wapo', 'wweek',
    ],
    'video-api-cdn.%s.arcpublishing.com/api',
  ],
];

export class ArcPublishingIE extends InfoExtractor {
  static IE_NAME = 'arcpublishing';
  static _VALID_URL = new RegExp(`arcpublishing:(?<org>[a-z]+):(?<id>${UUID_REGEX})`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let org = m.groups?.org ?? m[1] ?? '';
    const uuid = m.groups?.id ?? m[2] ?? '';

    let baseApiTmpl = '%s-prod-cdn.video-api.arcpublishing.com/api';
    for (const [orgs, tmpl] of POWA_DEFAULTS) {
      if (orgs.includes(org)) {
        baseApiTmpl = tmpl;
        break;
      }
    }
    if (org === 'wapo') org = 'washpost';

    const apiHost = baseApiTmpl.replace('%s', org);
    const videoList = await this._download_json<Record<string, unknown>[]>(
      `https://${apiHost}/v1/ansvideos/findByUuid`,
      uuid,
      undefined,
      { query: { uuid } },
    );
    const video = videoList[0] as Record<string, unknown>;
    const title = try_get(video, (x) => x.headlines.basic as string) || uuid;
    const isLive = video.status === 'live';

    const urls: string[] = [];
    const formats: Format[] = [];
    for (const s of (video.streams as Record<string, unknown>[]) || []) {
      const sUrl = s.url != null ? String(s.url) : '';
      if (!sUrl || urls.includes(sUrl)) continue;
      urls.push(sUrl);
      const streamType = s.stream_type != null ? String(s.stream_type) : '';
      if (streamType === 'smil') continue;
      if (streamType === 'ts' || streamType === 'hls') {
        const m3u8 = await this._extract_m3u8_formats(sUrl, uuid, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
        if (m3u8.every((f) => f.acodec === 'none')) continue;
        formats.push(...m3u8);
      } else {
        const vbr = int_or_none(s.bitrate);
        formats.push({
          format_id: streamType && vbr != null ? `${streamType}-${vbr}` : streamType || 'http',
          vbr: vbr ?? undefined,
          width: int_or_none(s.width) ?? undefined,
          height: int_or_none(s.height) ?? undefined,
          filesize: int_or_none(s.filesize) ?? undefined,
          url: sUrl,
          quality: -10,
        });
      }
    }

    const subtitles: VideoInfo['subtitles'] = {};
    for (const subtitle of (try_get(video, (x) => x.subtitles?.urls as Record<string, unknown>[]) || []) as Record<string, unknown>[]) {
      const subUrl = subtitle.url != null ? String(subtitle.url) : '';
      if (subUrl) {
        if (!subtitles.en) subtitles.en = [];
        subtitles.en!.push({ url: subUrl, ext: 'unknown' });
      }
    }

    return {
      id: uuid,
      title,
      thumbnail: try_get(video, (x) => x.promo_image?.url as string) || undefined,
      description: try_get(video, (x) => x.subheadlines?.basic as string) || null,
      formats,
      duration: int_or_none(video.duration, 100) ?? undefined,
      timestamp: parseIso8601(video.created_date) ?? undefined,
      subtitles,
      is_live: isLive,
      webpage_url: url,
      original_url: url,
      extractor: 'arcpublishing',
      extractor_key: 'ArcPublishing',
    };
  }
}
