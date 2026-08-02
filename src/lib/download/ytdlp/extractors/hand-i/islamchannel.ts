/**
 * IslamChannelIE / IslamChannelSeriesIE — ported from yt-dlp islamchannel.py
 */

import { InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, playlistFromMatches, urljoin } from './_helpers';

export class IslamChannelIE extends InfoExtractor {
  static IE_NAME = 'islamchannel';
  static _VALID_URL = /https?:\/\/watch\.islamchannel\.tv\/watch\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const thumbnail =
      this._search_regex(/data-poster="([^"]+)"/, webpage, 'data poster', null, false) ||
      this._html_search_meta(['og:image', 'twitter:image'], webpage, undefined, false);

    const headers = {
      Token: this._search_regex(/data-token="([^"]+)"/, webpage, 'data token')!,
      'Token-Expiry': this._search_regex(/data-expiry="([^"]+)"/, webpage, 'data expiry')!,
      Uvid: videoId,
    };

    const showStream = await this._download_json<Record<string, unknown>>(
      `https://v2-streams-elb.simplestreamcdn.com/api/show/stream/${videoId}`,
      videoId,
      undefined,
      {
        query: {
          key: this._search_regex(/data-key="([^"]+)"/, webpage, 'data key')!,
          platform: 'chrome',
        },
        headers,
      },
    );

    const tokenUrl = traverse_obj(showStream, ['response', 'tokenization', 'url']) as string;
    const streams = await this._download_json<Record<string, unknown>>(tokenUrl, videoId, undefined, {
      headers,
    });

    const adaptive = traverse_obj(streams, ['Streams', 'Adaptive']) as string;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, adaptive, videoId, 'hls');

    const thumbnails: Thumbnail[] | undefined = thumbnail
      ? [
          { id: 'unscaled', url: thumbnail.split('?')[0]!, preference: 2 },
          { id: 'orig', url: thumbnail, preference: 1 },
        ]
      : undefined;

    return {
      id: videoId,
      title:
        this._html_search_meta(['og:title', 'twitter:title'], webpage, undefined, false) ||
        videoId,
      description:
        this._html_search_meta(['og:description', 'twitter:description', 'description'], webpage, undefined, false) ||
        undefined,
      formats,
      subtitles,
      thumbnails,
    };
  }
}

export class IslamChannelSeriesIE extends InfoExtractor {
  static IE_NAME = 'islamchannel:series';
  static _VALID_URL = /https?:\/\/watch\.islamchannel\.tv\/series\/(?<id>[a-f\d-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const plId = this._match_id(url);
    const webpage = await this._download_webpage(url, plId);
    const urls = [...webpage.matchAll(/<a\s+href="(\/watch\/\d+)"[^>]+?data-video-type="show">/gi)].map((m) =>
      urljoin(url, m[1]!),
    );
    return playlistFromMatches(this, urls, plId, { ie: 'IslamChannel' });
  }
}
