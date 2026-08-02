/** CBS Sports family — ported from yt-dlp cbssports.py */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class CBSSportsEmbedIE extends InfoExtractor {
  static IE_NAME = 'cbssports:embed';
  static _VALID_URL =
    /^https?:\/\/(?:(?:www\.)?cbs|embed\.247)sports\.com\/player\/embed.+?(?:ids%3D(?<id>[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})|pcid%3D(?<pcid>\d+))/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url)!;
    const uuid = match.groups?.id;
    const pcid = match.groups?.pcid;
    const list = await this._download_json<Record<string, unknown>[]>(
      'https://www.cbssports.com/api/content/video/',
      uuid || pcid,
      undefined,
      { query: uuid ? { id: uuid } : { pcid: pcid! } },
    );
    const video = list[0] || {};
    const videoId = String(video.id);
    const title = String(video.title || '');
    const metadata = (video.metaData as Record<string, unknown>) || {};
    const files = metadata.files as Record<string, unknown>[] | undefined;
    const m3u8Url = String(files?.[0]?.url || '');

    const formats = m3u8Url
      ? await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)
      : [];

    const image = video.image as Record<string, unknown> | undefined;
    const thumbnails: Thumbnail[] | undefined = image?.path
      ? [
          {
            url: String(image.path),
            width: int_or_none(image.width),
            height: int_or_none(image.height),
          },
        ]
      : undefined;

    const dateCreated = (video.dateCreated as Record<string, unknown>) || {};

    return {
      id: videoId,
      title,
      formats,
      thumbnails,
      description: (video.description as string) || undefined,
      timestamp: int_or_none(dateCreated.epoch) ?? undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
    };
  }
}

export class CBSSportsBaseIE extends InfoExtractor {
  static IE_NAME = 'cbssportsbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const iframeUrl = this._search_regex(
      /<iframe[^>]+(?:data-)?src="(https?:\/\/[^/]+\/player\/embed[^"]+)"/,
      webpage,
      'embed url',
    );
    return this.url_result(iframeUrl!, 'CBSSportsEmbed');
  }
}

export class CBSSportsIE extends CBSSportsBaseIE {
  static IE_NAME = 'cbssports';
  static _VALID_URL = /^https?:\/\/(?:www\.)?cbssports\.com\/[^/]+\/video\/(?<id>[^/?#&]+)/;
}

export class TwentyFourSevenSportsIE extends CBSSportsBaseIE {
  static IE_NAME = '247sports';
  static _VALID_URL = /^https?:\/\/(?:www\.)?247sports\.com\/Video\/(?:[^/?#&]+-)?(?<id>\d+)/;
}
