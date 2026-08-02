/** TrueIDIE — ported from yt-dlp trueid.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  parse_age_limit,
  searchNextjsData,
} from './_helpers';

export class TrueIDIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?<domain>vn\.trueid\.net|trueid\.(?:id|ph))\/(?:movie|series\/[^/]+)\/(?<id>[^/?#&]+)/;

  static _CUSTOM_RATINGS: Record<string, number> = { PG: 7 };

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const videoId = m.groups!.id!;
    const webpage = await this._download_webpage(url, videoId);

    const initialData =
      (traverse_obj(searchNextjsData(this, webpage, videoId), [
        'pageProps',
        'initialContentData',
      ]) as Record<string, unknown>) || {};

    let formats: VideoInfo['formats'] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    try {
      const streamData = (
        await this._download_json<{ data?: Record<string, unknown> }>(
          `https://${domain}/cmsPostProxy/contents/video/${videoId}/streamer?os=android`,
          videoId,
          undefined,
          { method: 'POST', data: '' },
        )
      ).data;

      if (streamData) {
        const streamUrl = traverse_obj(streamData, ['stream', 'stream_url', String]) as
          | string
          | undefined;
        if (streamUrl) {
          const streamExt = determine_ext(streamUrl);
          if (streamExt === 'm3u8') {
            const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, 'mp4');
            formats = res.formats;
            subtitles = mergeSubtitles(subtitles, res.subtitles);
          } else if (streamExt === 'mpd') {
            const res = await extractMpdFormatsAndSubtitles(this, streamUrl, videoId);
            formats = res.formats;
            subtitles = mergeSubtitles(subtitles, res.subtitles);
          } else {
            formats = [{ url: streamUrl, format_id: streamExt || 'http' }];
          }
        }
      }
    } catch (e) {
      if (e instanceof ExtractorError) {
        const cause = (e as ExtractorError & { cause?: { body?: string } }).cause;
        if (cause?.body) {
          const parsed = this._parse_json<{ meta?: { message?: string } }>(
            cause.body,
            videoId,
            null,
            false,
          );
          const errmsg = parsed?.meta?.message || '';
          if (errmsg.includes('country')) {
            this.raise_geo_restricted(
              errmsg,
              initialData.display_country ? [String(initialData.display_country)] : undefined,
            );
          }
          this.raise_no_formats(errmsg, true);
        }
      }
      throw e;
    }

    const thumbnails = Object.entries((initialData.thumb_list as Record<string, unknown>) || {})
      .map(([thumbKey, thumbUrl]) => {
        const u = url_or_none(thumbUrl);
        return u ? { id: thumbKey, url: u } : null;
      })
      .filter(Boolean) as Array<{ id: string; url: string }>;

    const rate = initialData.rate != null ? String(initialData.rate) : undefined;

    return {
      id: videoId,
      title:
        (initialData.title ? String(initialData.title) : null) ||
        this._html_search_regex(
          [
            /Nonton (?<name>.+) Gratis/,
            /Xem (?<name>.+) Miễn phí/,
            /Watch (?<name>.+) Free/,
          ],
          webpage,
          'title',
          'name',
          false,
        ) ||
        videoId,
      display_id: initialData.slug_title ? String(initialData.slug_title) : undefined,
      description: initialData.synopsis ? String(initialData.synopsis) : undefined,
      timestamp: unified_timestamp(initialData.create_date) ?? undefined,
      categories: ((initialData.article_category_details as Array<Record<string, unknown>>) || [])
        .map((c) => c.name)
        .filter(Boolean)
        .map(String),
      release_timestamp: unified_timestamp(initialData.publish_date) ?? undefined,
      release_year: int_or_none(initialData.release_year) ?? undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      thumbnails,
      age_limit:
        (rate ? TrueIDIE._CUSTOM_RATINGS[rate] : undefined) ?? parse_age_limit(rate) ?? undefined,
      cast: [
        ...((initialData.actor as unknown[]) || []),
        ...((initialData.director as unknown[]) || []),
      ].map(String),
      view_count: int_or_none(initialData.count_views) ?? undefined,
      like_count: int_or_none(initialData.count_likes) ?? undefined,
      average_rating: int_or_none(initialData.count_ratings) ?? undefined,
    };
  }
}
