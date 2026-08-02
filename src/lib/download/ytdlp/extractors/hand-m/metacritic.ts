/** MetacriticIE — ported from yt-dlp metacritic.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

function fixXmlAmpersands(src: string): string {
  return src.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g, '&amp;');
}

export class MetacriticIE extends InfoExtractor {
  static IE_NAME = 'metacritic';
  static _VALID_URL = /https?:\/\/(?:www\.)?metacritic\.com\/.+?\/trailers\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    let infoXml = await this._download_webpage(
      `http://www.metacritic.com/video_data?video=${videoId}`,
      videoId,
      'Downloading info xml',
    );
    infoXml = fixXmlAmpersands(infoXml);

    const clips = [...infoXml.matchAll(/<clip>([\s\S]*?)<\/clip>/gi)];
    let clipXml = '';
    for (const c of clips) {
      if (c[1]?.includes(`<id>${videoId}</id>`)) {
        clipXml = c[1];
        break;
      }
    }
    if (!clipXml) throw new Error('Unable to find clip in XML');

    const formats: Format[] = [];
    for (const vf of clipXml.matchAll(/<videoFile>([\s\S]*?)<\/videoFile>/gi)) {
      const block = vf[1] || '';
      const rateStr = block.match(/<rate>([^<]+)<\/rate>/i)?.[1];
      const videoUrl = block.match(/<filePath>([^<]+)<\/filePath>/i)?.[1];
      if (!rateStr || !videoUrl) continue;
      formats.push({ url: videoUrl, ext: 'mp4', format_id: rateStr, tbr: Number(rateStr) });
    }

    const description = this._html_search_regex(/<b>Description:<\/b>([\s\S]*?)<\/p>/, webpage, 'description');

    return {
      id: videoId,
      title: clipXml.match(/<title>([^<]+)<\/title>/i)?.[1],
      formats,
      description: description ?? undefined,
      duration: Number(clipXml.match(/<duration>([^<]+)<\/duration>/i)?.[1] || 0) || undefined,
    };
  }
}
