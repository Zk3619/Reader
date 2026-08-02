/** NozIE — ported from yt-dlp noz.py (main path; site may be offline) */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class NozIE extends InfoExtractor {
  static IE_NAME = 'Noz';
  static _VALID_URL = /https?:\/\/(?:www\.)?noz\.de\/video\/(?<id>[0-9]+)\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const description = this._og_search_description(webpage) || undefined;

    const edgeUrl = this._html_search_regex(
      /<script[^>]+src="([^"]*\/videojs_[^"]+)"/,
      webpage,
      'edge URL',
    )!;
    const edgeContent = await this._download_webpage(edgeUrl, 'meta configuration');
    const configUrlEncoded = this._search_regex(
      /so\.addVariable\("config_url","[^,]*,(.*?)"/,
      edgeContent,
      'config URL',
    )!;
    const configUrl = decodeURIComponent(configUrlEncoded);
    const doc = await this._download_webpage(configUrl, 'video configuration');

    const title = doc.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || videoId;
    const thumbnail = doc.match(/<thumbnail[^>]*>([\s\S]*?)<\//i)?.[1]?.trim();
    const duration = int_or_none(doc.match(/<duration[^>]*>([\s\S]*?)<\/duration>/i)?.[1]);

    const formats: Format[] = [];
    for (const qblock of doc.matchAll(/<qual\b[^>]*>([\s\S]*?)<\/qual>/gi)) {
      const qxml = qblock[1] || '';
      const httpUrl = qxml.match(/format="video\/mp4"[^>]*>([\s\S]*?)<\//i)?.[1]?.trim();
      if (httpUrl) {
        formats.push({
          url: httpUrl,
          format_id: `http-${qxml.match(/<id[^>]*>([\s\S]*?)<\//i)?.[1]?.trim() || 'sd'}`,
          height: int_or_none(qxml.match(/<height[^>]*>([\s\S]*?)<\//i)?.[1]) ?? undefined,
          width: int_or_none(qxml.match(/<width[^>]*>([\s\S]*?)<\//i)?.[1]) ?? undefined,
        });
      } else {
        const m3u8Url = qxml.match(/format="application\/vnd\.apple\.mpegurl"[^>]*>([\s\S]*?)<\//i)?.[1]?.trim();
        if (m3u8Url) {
          formats.push(
            ...(await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        }
      }
    }

    return { id: videoId, formats, title, duration: duration ?? undefined, description, thumbnail };
  }
}
