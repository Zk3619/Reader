/**
 * DigiviewIE — ported from yt-dlp digiview.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, url_or_none } from '../../utils';
import { urlencodePostdata } from './_helpers';

export class DigiviewIE extends InfoExtractor {
  static IE_NAME = 'digiview';
  static _VALID_URL = /https?:\/\/(?:www\.)?ladigitale\.dev\/digiview\/#\/v\/(?<id>[0-9a-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = await this._download_json<Record<string, unknown>>(
      'https://ladigitale.dev/digiview/inc/recuperer_video.php',
      videoId,
      undefined,
      { data: urlencodePostdata({ id: videoId }), method: 'POST' },
    );
    const clipId = String(videoData.videoId ?? '');
    return {
      ...this.url_result(`https://www.youtube.com/watch?v=${clipId}`, 'Youtube', videoId),
      _type: 'url_transparent',
      section_start: int_or_none(videoData.debut) ?? undefined,
      section_end: int_or_none(videoData.fin) ?? undefined,
      description: clean_html(String(videoData.description ?? '')) || undefined,
      title: String(videoData.titre ?? ''),
      thumbnail: url_or_none(videoData.vignette) ?? undefined,
      view_count: int_or_none(videoData.vues) ?? undefined,
    };
  }
}
