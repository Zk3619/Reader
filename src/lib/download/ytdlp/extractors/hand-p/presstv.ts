/** PressTVIE — ported from yt-dlp presstv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { remove_start } from '../../utils';
import { hiddenInputs } from './_helpers';

export class PressTVIE extends InfoExtractor {
  static IE_NAME = 'presstv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?presstv\.ir\/[^/]+\/(?<y>\d+)\/(?<m>\d+)\/(?<d>\d+)\/(?<id>\d+)\/(?<display_id>[^/]+)?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const displayId = m.groups?.display_id || videoId;
    const webpage = await this._download_webpage(url, displayId);

    const videoUrl = hiddenInputs(webpage).inpPlayback;
    if (!videoUrl) throw new Error('Unable to extract playback URL');

    const baseUrl = 'http://192.99.219.222:82/presstv';
    const formatDefs: Array<[number, string]> = [
      [180, '_low200.mp4'],
      [360, '_low400.mp4'],
      [720, '_low800.mp4'],
      [1080, '.mp4'],
    ];
    const base = videoUrl.slice(0, -4);
    const formats: Format[] = formatDefs.map(([height, ext]) => ({
      url: baseUrl + base + ext,
      format_id: `${height}p`,
      height,
      ext: 'mp4',
    }));

    const rawTitle = this._html_search_meta('title', webpage, undefined, true);
    const title = remove_start(rawTitle || '', 'PressTV-') || undefined;

    return {
      id: videoId,
      display_id: displayId,
      title,
      formats,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      upload_date: `${m.groups?.y}${String(m.groups?.m).padStart(2, '0')}${String(m.groups?.d).padStart(2, '0')}`,
      description: this._og_search_description(webpage) ?? undefined,
    };
  }
}
