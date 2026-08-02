/** MediciIE — ported from yt-dlp medici.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { filter_dict, str_or_none, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class MediciIE extends InfoExtractor {
  static IE_NAME = 'medici';
  static _VALID_URL = /https?:\/\/(?:(?<sub>www|edu)\.)?medici\.tv\/[a-z]{2}\/[\w.-]+\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const subdomain = m.groups!.sub;
    await this._request_webpage(url, displayId, 'Requesting CSRF token cookie');
    const apiSub = subdomain === 'edu' ? 'edu-' : '';
    const origin = new URL(url).origin;

    const data = await this._download_json<Record<string, unknown>>(
      `https://api.medici.tv/${apiSub}satie/edito/movie-file/${displayId}/`,
      displayId,
      undefined,
      {
        headers: filter_dict({
          Authorization: (() => {
            const token = this._get_cookies(url)['auth._token.mAuth'];
            return token ? decodeURIComponent(token) : undefined;
          })(),
          'Device-Type': 'web',
          Origin: origin,
          Referer: `${origin}/`,
          Accept: 'application/json, text/plain, */*',
        }) as Record<string, string>,
      },
    );

    const video = (data.video as Record<string, unknown>) || {};
    if (!video.is_full_video && video.is_limited_by_user_access) {
      this.report_warning(
        'The full video is for subscribers only. Only previews will be downloaded. Use --cookies if you are logged in.',
      );
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(video.video_url ?? ''),
      displayId,
      'hls',
    );

    return {
      id: String(data.id ?? displayId),
      display_id: displayId,
      formats,
      subtitles,
      title: str_or_none(data.title) ?? undefined,
      description: str_or_none(data.subtitle) ?? undefined,
      thumbnail: url_or_none(data.picture) ?? undefined,
      timestamp: parseIso8601(data.date_publish) ?? undefined,
    };
  }
}
