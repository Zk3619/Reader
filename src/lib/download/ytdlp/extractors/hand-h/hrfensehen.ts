/**
 * HRFernsehenIE — ported from yt-dlp hrfensehen.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, unescapeHTML, unified_timestamp } from '../../utils';

type LoaderData = {
  mediaCollection?: {
    streams?: Array<{ media?: Array<Record<string, unknown>> }>;
    subTitles?: Array<{ sources?: Array<{ url?: string }> }>;
  };
  playerConfig?: { pluginData?: Record<string, Record<string, unknown>> };
};

export class HRFernsehenIE extends InfoExtractor {
  static IE_NAME = 'hrfernsehen';
  static _VALID_URL =
    /https?:\/\/www\.(?:hr-fernsehen|hessenschau)\.de\/.*,video-(?<id>[0-9]{6})\.html/;

  protected extractFormats(loaderData: LoaderData): Format[] {
    const streamFormats: Format[] = [];
    const data = loaderData.mediaCollection?.streams?.[0]?.media || [];
    for (const inner of data.slice(1)) {
      const innerUrl = String(inner.url ?? '');
      const streamFormat: Format = {
        format_id: inner.maxHResolutionPx ? `${inner.maxHResolutionPx}p` : 'http',
        height: int_or_none(inner.maxHResolutionPx) ?? undefined,
        url: innerUrl,
      };
      const qualityInformation = innerUrl.match(/([0-9]{3,4})x([0-9]{3,4})-([0-9]{2})p-([0-9]{3,4})kbit/);
      if (qualityInformation) {
        streamFormat.width = int_or_none(qualityInformation[1]) ?? undefined;
        streamFormat.height = int_or_none(qualityInformation[2]) ?? undefined;
        streamFormat.fps = int_or_none(qualityInformation[3]) ?? undefined;
        streamFormat.tbr = int_or_none(qualityInformation[4]) ?? undefined;
      }
      streamFormats.push(streamFormat);
    }
    return streamFormats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title =
      this._html_search_meta(['og:title', 'twitter:title', 'name'], webpage, undefined, false) ?? videoId;
    const description =
      this._html_search_meta(['description'], webpage, undefined, false) ?? undefined;

    const loaderStr = unescapeHTML(
      this._search_regex(/data-(?:new-)?hr-mediaplayer-loader='([^']*)'/, webpage, 'ardloader'),
    );
    const loaderData = JSON.parse(loaderStr) as LoaderData;

    const subtitle = loaderData.mediaCollection?.subTitles?.[0]?.sources?.[0]?.url;
    const tracking = loaderData.playerConfig?.pluginData?.['trackingAti@all'] as
      | Record<string, unknown>
      | undefined;
    const richMedia = (tracking?.richMedia as Record<string, unknown>) || {};

    return {
      id: videoId,
      title,
      description,
      formats: this.extractFormats(loaderData),
      subtitles: subtitle ? { de: [{ url: subtitle, ext: 'vtt' }] } : undefined,
      timestamp:
        unified_timestamp(
          this._search_regex(/<time\sdatetime="(\d{4}\W\d{1,2}\W\d{1,2})"/, webpage, 'datetime', null, false) ||
            undefined,
        ) ?? undefined,
      duration: int_or_none(richMedia.duration) ?? undefined,
      thumbnail:
        this._search_regex(/thumbnailUrl\W*([^"]+)/, webpage, 'thumbnail', null, false) ?? undefined,
    };
  }
}
