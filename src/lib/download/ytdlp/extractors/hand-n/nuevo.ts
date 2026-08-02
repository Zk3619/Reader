/** NuevoBaseIE — ported from yt-dlp nuevo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none } from '../../utils';

export class NuevoBaseIE extends InfoExtractor {
  static IE_NAME = 'NuevoBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NuevoBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractNuevo(
    configUrl: string,
    videoId: string,
    headers: Record<string, string> = {},
  ): Promise<VideoInfo> {
    const xml = await this._download_webpage(configUrl, videoId, undefined, { headers });
    const title = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    if (!title) throw new ExtractorError('Unable to extract title', { expected: true });
    const mediaId = xml.match(/<mediaid[^>]*>([\s\S]*?)<\/mediaid>/i)?.[1]?.trim() || videoId;
    const thumbnail =
      xml.match(/<(?:image|thumb)[^>]*>([\s\S]*?)<\//i)?.[1]?.trim() || undefined;
    const duration = float_or_none(xml.match(/<duration[^>]*>([\s\S]*?)<\/duration>/i)?.[1]);

    const formats: Format[] = [];
    for (const [tag, fid] of [
      ['file', 'sd'],
      ['filehd', 'hd'],
    ] as const) {
      const u = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim();
      if (u) formats.push({ url: u, format_id: fid });
    }

    return { id: mediaId, title, thumbnail, duration: duration ?? undefined, formats };
  }
}
