/**
 * CoubIE — ported from yt-dlp coub.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none, int_or_none } from '../../utils';
import { parseIso8601, qualityRank } from './_helpers';

export class CoubIE extends InfoExtractor {
  static IE_NAME = 'Coub';
  static _VALID_URL =
    /(?:coub:|https?:\/\/(?:coub\.com\/(?:view|embed|coubs)\/|c-cdn\.coub\.com\/fb-player\.swf\?.*\bcoub(?:ID|id)=))(?<id>[\da-z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const coub = await this._download_json<Record<string, unknown>>(`http://coub.com/api/v2/coubs/${videoId}.json`, videoId);

    if (coub.error) {
      throw new ExtractorError(`${this.IE_NAME} said: ${coub.error}`, { expected: true });
    }

    const title = String(coub.title ?? videoId);
    const fileVersions = (coub.file_versions as Record<string, unknown>) || {};

    const QUALITIES = ['low', 'med', 'high', 'higher'];
    const MOBILE = 'mobile';
    const IPHONE = 'iphone';
    const HTML5 = 'html5';
    const SOURCE_PREFERENCE = [MOBILE, IPHONE, HTML5];

    const qualityKey = qualityRank(QUALITIES);
    const preferenceKey = qualityRank(SOURCE_PREFERENCE);

    const formats: Format[] = [];

    const html5 = (fileVersions[HTML5] as Record<string, unknown>) || {};
    for (const [kind, items] of Object.entries(html5)) {
      if (kind !== 'video' && kind !== 'audio') continue;
      if (!items || typeof items !== 'object') continue;
      for (const [quality, item] of Object.entries(items as Record<string, unknown>)) {
        if (!item || typeof item !== 'object') continue;
        const itemUrl = (item as Record<string, unknown>).url as string | undefined;
        if (!itemUrl) continue;
        formats.push({
          url: itemUrl,
          format_id: `${HTML5}-${kind}-${quality}`,
          filesize: int_or_none((item as Record<string, unknown>).size) ?? undefined,
          vcodec: kind === 'audio' ? 'none' : undefined,
          acodec: kind === 'video' ? 'none' : undefined,
          quality: qualityKey(quality),
          source_preference: preferenceKey(HTML5),
        });
      }
    }

    const iphoneUrl = ((fileVersions[IPHONE] as Record<string, unknown>) || {}).url as string | undefined;
    if (iphoneUrl) {
      formats.push({ url: iphoneUrl, format_id: IPHONE, source_preference: preferenceKey(IPHONE) });
    }

    const mobileUrl = ((fileVersions[MOBILE] as Record<string, unknown>) || {}).audio_url as string | undefined;
    if (mobileUrl) {
      formats.push({ url: mobileUrl, format_id: `${MOBILE}-audio`, source_preference: preferenceKey(MOBILE) });
    }

    const thumbnail = (coub.picture as string) ?? undefined;
    const duration = float_or_none(coub.duration) ?? undefined;
    const timestamp = parseIso8601(coub.published_at ?? coub.created_at) ?? undefined;
    const channel = (coub.channel as Record<string, unknown>) || {};
    const uploader = (channel.title as string) ?? undefined;
    const uploaderId = (channel.permalink as string) ?? undefined;

    const viewCount = int_or_none(coub.views_count ?? coub.views_increase_count) ?? undefined;
    const likeCount = int_or_none(coub.likes_count) ?? undefined;
    const repostCount = int_or_none(coub.recoubs_count) ?? undefined;

    const ageRestricted = coub.age_restricted ?? coub.age_restricted_by_admin;
    const ageLimit = ageRestricted != null ? (ageRestricted === true ? 18 : 0) : undefined;

    return {
      id: videoId,
      title,
      thumbnail,
      duration,
      timestamp,
      uploader,
      uploader_id: uploaderId,
      view_count: viewCount,
      like_count: likeCount,
      repost_count: repostCount,
      age_limit: ageLimit,
      formats,
    };
  }
}
