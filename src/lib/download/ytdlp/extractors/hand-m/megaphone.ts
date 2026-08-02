/** MegaphoneIE — ported from yt-dlp megaphone.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, js_to_json } from '../../utils';
import { protoRelative } from './_helpers';

export class MegaphoneIE extends InfoExtractor {
  static IE_NAME = 'megaphone.fm';
  static IE_DESC = 'megaphone.fm embedded players';
  static _VALID_URL = /https?:\/\/player\.megaphone\.fm\/(?<id>[A-Z0-9]+)/;
  static _EMBED_REGEX = [/<iframe[^>]*?\ssrc=["'](?<url>https?:\/\/player\.megaphone\.fm\/(?<id>[A-Z0-9]+))/];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = this._og_search_property('audio:title', webpage);
    const author = this._og_search_property('audio:artist', webpage);
    const thumbnail = this._og_search_thumbnail(webpage);
    const episodeJson = this._search_regex(/var\s+episode\s*=\s*(\{[\s\S]+?\});/, webpage, 'episode JSON')!;
    const episodeData = this._parse_json<Record<string, unknown>>(js_to_json(episodeJson), videoId) || {};
    const videoUrl = protoRelative(String(episodeData.mediaUrl ?? ''));
    const formats: Format[] = [{ url: videoUrl, format_id: 'http', vcodec: 'none' }];

    return {
      id: videoId,
      thumbnail: thumbnail ?? undefined,
      title: title ?? undefined,
      creators: author ? [author] : undefined,
      duration: float_or_none(episodeData.duration) ?? undefined,
      formats,
    };
  }
}
