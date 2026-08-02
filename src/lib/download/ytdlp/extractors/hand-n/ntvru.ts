/** NTVRuIE — ported from yt-dlp ntvru.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, unescapeHTML, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

function xpathText(xml: string, path: string): string | null {
  const tag = path.split('/').pop() || path;
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m?.[1]?.trim() || null;
}

export class NTVRuIE extends InfoExtractor {
  static IE_NAME = 'ntv.ru';
  static _VALID_URL = /https?:\/\/(?:www\.)?ntv\.ru\/(?:[^/#?]+\/)*(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId =
      this._html_search_regex(
        /<meta property="ya:ovs:feed_url" content="https?:\/\/www\.ntv\.ru\/(?:exp\/)?video\/(\d+)/,
        webpage,
        'video id',
      ) || displayId;

    const playerXml = await this._download_webpage(`http://www.ntv.ru/vi${videoId}/`, videoId);
    const formats: Format[] = [];
    for (const fid of ['', 'hi', 'webm']) {
      const fileUrl = url_or_none(xpathText(playerXml, `./data/video/${fid}file`));
      if (fileUrl) {
        formats.push({
          url: fileUrl.startsWith('//') ? `https:${fileUrl}` : fileUrl,
          format_id: fid || 'sd',
          filesize: int_or_none(xpathText(playerXml, `./data/video/${fid}size`)) ?? undefined,
        });
      }
    }
    const hls = xpathText(playerXml, './data/video/playback/hls');
    if (hls) {
      formats.push(...(await this._extract_m3u8_formats(hls, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
    }
    const dash = xpathText(playerXml, './data/video/playback/dash');
    if (dash) {
      formats.push(...(await this._extract_mpd_formats(dash, videoId, 'dash', undefined, false)));
    }

    const metadata = await this._download_webpage(
      `https://www.ntv.ru/exp/video/${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    );

    return {
      id: videoId,
      formats,
      title: unescapeHTML(xpathText(playerXml, './data/title') || xpathText(metadata || '', 'title') || displayId) || displayId,
      description:
        unescapeHTML(xpathText(playerXml, './data/description') || xpathText(metadata || '', 'description') || '') ||
        undefined,
      duration: int_or_none(xpathText(playerXml, './data/video/totaltime')) ?? int_or_none(xpathText(metadata || '', 'duration')) ?? undefined,
      view_count: int_or_none(xpathText(playerXml, './data/video/views')) ?? undefined,
      thumbnail: url_or_none(xpathText(playerXml, './data/video/splash')) ?? undefined,
      timestamp: parseIso8601(xpathText(metadata || '', 'create_date')) ?? undefined,
      release_timestamp: parseIso8601(xpathText(metadata || '', 'upload_date')) ?? undefined,
      modified_timestamp: parseIso8601(xpathText(metadata || '', 'modify_date')) ?? undefined,
      tags: metadata
        ? (xpathText(metadata, 'tag') || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
      comment_count: int_or_none(xpathText(metadata || '', 'stats/comments')) ?? undefined,
    };
  }
}
