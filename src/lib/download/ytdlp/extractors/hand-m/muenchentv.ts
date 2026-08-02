/**
 * MuenchenTVIE — ported from yt-dlp muenchentv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, js_to_json } from '../../utils';

export class MuenchenTVIE extends InfoExtractor {
  static IE_NAME = 'muenchentv';
  static _VALID_URL = /https?:\/\/(?:www\.)?muenchen\.tv\/livestream/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = 'live';
    const webpage = await this._download_webpage(url, displayId);
    const title = this._og_search_title(webpage) || displayId;

    const dataJs = this._search_regex(/\nplaylist:\s*(\[.*?}\]),/, webpage, 'playlist configuration')!;
    const data = JSON.parse(js_to_json(dataJs))[0] as Record<string, unknown>;
    const videoId = String(data.mediaid ?? displayId);
    const thumbnail = data.image as string | undefined;
    const sources = (data.sources as Array<Record<string, unknown>>) || [];

    const formats: Format[] = sources.map((s, formatNum) => {
      const file = String(s.file ?? '');
      const ext = determine_ext(file, '');
      const labelStr = s.label != null ? String(s.label) : `_${formatNum}`;
      const formatId = ext ? `${ext}-${labelStr}` : labelStr;
      return {
        url: file,
        tbr: int_or_none(s.label) ?? undefined,
        ext: 'mp4',
        format_id: formatId,
        preference: file.includes('.smil') ? -100 : 0,
      };
    });

    return {
      id: videoId,
      display_id: displayId,
      title,
      formats,
      is_live: true,
      thumbnail,
    };
  }
}
