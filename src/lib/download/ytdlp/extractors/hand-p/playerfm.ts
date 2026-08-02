/** PlayerFmIE — ported from yt-dlp playerfm.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, url_or_none } from '../../utils';

function cleanPodcastUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    return u.toString();
  } catch {
    return url;
  }
}

export class PlayerFmIE extends InfoExtractor {
  static IE_NAME = 'playerfm';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?player\.fm\/(?:series\/)?[\w-]+\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.id ?? '';
    const pageUrl = m.groups?.url ?? url.replace(/\/$/, '');
    const data = await this._download_json<Record<string, unknown>>(`${pageUrl}.json`, displayId);

    const series = (data.series as Record<string, unknown>) || {};
    const image =
      url_or_none((data.image as Record<string, unknown>)?.url) ||
      url_or_none((series.image as Record<string, unknown>)?.url);

    return {
      display_id: displayId,
      vcodec: 'none',
      id: str_or_none(data.id) ?? displayId,
      url: cleanPodcastUrl(String(data.url ?? '')),
      title: str_or_none(data.title) ?? undefined,
      description: clean_html(str_or_none(data.description)) ?? undefined,
      duration: int_or_none(data.duration) ?? undefined,
      thumbnail: image ?? undefined,
      filesize: int_or_none(data.size) ?? undefined,
      timestamp: int_or_none(data.publishedAt) ?? undefined,
      creators: series.author ? [String(series.author)] : undefined,
    };
  }
}
