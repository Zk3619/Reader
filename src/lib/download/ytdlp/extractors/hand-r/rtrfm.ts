/** RTRFMIE — ported from yt-dlp rtrfm.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class RTRFMIE extends InfoExtractor {
  static IE_NAME = 'RTRFM';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtrfm\.com\.au\/(?:shows|show-episode)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const details = webpage.match(
      /\.playShow(?:From)?\(['"](?<show>[^'"]+)['"],\s*['"](?<date>[0-9]{4}-[0-9]{2}-[0-9]{2})['"],\s*['"](?<title>[^'"]+)['"]/,
    );
    if (!details?.groups) throw new ExtractorError('Unable to extract show details');
    const { show, date, title } = details.groups;

    const json = await this._download_json<{ u?: string }>(
      'https://restreams.rtrfm.com.au/rzz',
      show,
      'Downloading MP3 URL',
      { query: { n: show, d: date } },
    );
    let mp3Url = json.u;
    if (mp3Url && mp3Url.includes('.mp4')) {
      mp3Url = undefined;
      throw new ExtractorError('Expired or no episode on this date', { expected: true });
    }

    return {
      id: `${show}-${date}`,
      title: `${title} ${date}`,
      series: title,
      url: mp3Url,
      release_date: date,
      description: this._og_search_description(webpage) ?? undefined,
    };
  }
}
