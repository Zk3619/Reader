/** RudoVideoIE — ported from yt-dlp rudovideo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, js_to_json, traverse_obj, update_url_query } from '../../utils';

export class RudoVideoIE extends InfoExtractor {
  static IE_NAME = 'RudoVideo';
  static _VALID_URL = /https?:\/\/rudo\.video\/(?<type>vod|podcast|live)\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const type = m.groups!.type!;
    const isLive = type === 'live';

    const webpage = await this._download_webpage(url, videoId);
    if (webpage.includes('Streaming is not available in your area')) {
      this.raise_geo_restricted();
    }

    let mediaUrl =
      this._search_regex(/var\s+streamURL\s*=\s*['"]([^?'"]+)/, webpage, 'stream url', null, false) ||
      this._search_regex(/<source[^>]+src=['"]([^'"]+)/, webpage, 'source url', null, false);
    if (!mediaUrl) {
      const youtubeUrl = this._search_regex(
        /file:\s*['"]((?:https?:)\/\/(?:www\.)?youtube\.com[^'"]+)/,
        webpage,
        'youtube url',
        null,
        false,
      );
      if (youtubeUrl) return this.url_result(youtubeUrl, 'Youtube');
      throw new ExtractorError('Unable to extract stream url');
    }

    const tokenArray = this._search_json(
      /<script>var\s+_\$_[a-zA-Z0-9]+\s*=/,
      webpage,
      'access token array',
      videoId,
      { default: null, transform_source: js_to_json },
    ) as unknown[] | null;
    if (tokenArray) {
      const tokenUrl = traverse_obj(tokenArray, ['all', undefined], { expected_type: 'url' }) as string | undefined;
      if (!tokenUrl) throw new ExtractorError('Invalid access token array');
      const tokenResp = await this._download_json<{ data?: { authToken?: string } }>(
        tokenUrl,
        videoId,
        'Downloading access token',
      );
      const accessToken = tokenResp.data?.authToken;
      if (accessToken) mediaUrl = update_url_query(mediaUrl, { 'auth-token': accessToken });
    }

    const ext = determine_ext(mediaUrl);
    let formats: Format[];
    if (ext === 'm3u8') {
      formats = await this._extract_m3u8_formats(mediaUrl, videoId, undefined, undefined, undefined, undefined, undefined, undefined, isLive);
    } else if (ext === 'mp3') {
      formats = [{ url: mediaUrl, format_id: 'mp3', ext: 'mp3', vcodec: 'none' }];
    } else {
      formats = [{ url: mediaUrl, format_id: ext || 'http' }];
    }

    const title =
      this._search_regex(/var\s+titleVideo\s*=\s*['"]([^'"]+)/, webpage, 'title', null, false) ||
      this._og_search_title(webpage) ||
      undefined;
    const creator = this._search_regex(/var\s+videoAuthor\s*=\s*['"]([^?'"]+)/, webpage, 'videoAuthor', null, false);
    const thumbnail =
      this._search_regex(/var\s+posterIMG\s*=\s*['"]([^?'"]+)/, webpage, 'thumbnail', null, false) ||
      this._og_search_thumbnail(webpage) ||
      undefined;

    return {
      id: videoId,
      title,
      creator: creator ?? undefined,
      thumbnail,
      formats,
      is_live: isLive,
    };
  }
}
