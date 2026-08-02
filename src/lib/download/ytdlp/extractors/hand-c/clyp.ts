/**
 * ClypIE — ported from yt-dlp clyp.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, parse_qs, unified_timestamp } from '../../utils';

export class ClypIE extends InfoExtractor {
  static IE_NAME = 'clyp';
  static _VALID_URL = /https?:\/\/(?:www\.)?clyp\.it\/(?<id>[a-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);

    const qs = parse_qs(url);
    const token = qs.token?.[0];

    const metadata = await this._download_json<Record<string, unknown>>(`https://api.clyp.it/${audioId}`, audioId, undefined, {
      query: token ? { token } : undefined,
    });

    const formats: Format[] = [];
    for (const secure of ['', 'Secure']) {
      for (const ext of ['Ogg', 'Mp3']) {
        const formatId = `${secure}${ext}`;
        const formatUrl = metadata[`${formatId}Url`] as string | undefined;
        if (formatUrl) {
          formats.push({ url: formatUrl, format_id: formatId, vcodec: 'none', acodec: ext.toLowerCase() });
        }
      }
    }

    const page = await this._download_webpage(url, audioId);
    const wavUrl = this._html_search_regex(/var\s*wavStreamUrl\s*=\s*["'](?<url>https?:\/\/[^'"]+)/, page, 'url', null, false);
    if (wavUrl) {
      formats.push({ url: wavUrl, format_id: 'wavStreamUrl', vcodec: 'none', acodec: 'wav' });
    }

    return {
      id: audioId,
      title: metadata.Title as string,
      description: (metadata.Description as string) || undefined,
      duration: float_or_none(metadata.Duration) ?? undefined,
      timestamp: unified_timestamp(metadata.DateCreated) ?? undefined,
      formats,
    };
  }
}
