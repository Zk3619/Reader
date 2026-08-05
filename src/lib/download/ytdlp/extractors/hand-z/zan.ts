// @ts-nocheck
/** ZanIE â€?ported from yt-dlp zan.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none } from '../../utils';
import { parse_iso8601 } from './_helpers';

export class ZanIE extends InfoExtractor {
  static IE_NAME = 'zan';
  static IE_DESC = 'Z-aN';
  static _GEO_BYPASS = false;
  static _GEO_COUNTRIES = ['JP'];
  static _VALID_URL = /https?:\/\/(?:www\.)?zan-live\.com\/[^/?#]+\/live\/play\/\d+\/(?<id>\d+)/;
  static _BASE_URL = 'https://www.zan-live.com';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const err = this._search_regex(
      /<[^>]+class=["'][^"']*p-common_message__headline--error[^"']*["'][^>]*>(?<msg>[\s\S]*?)<\/[^>]+>/,
      webpage,
      'geo error',
      null,
      false,
      'msg',
    );
    if (err) this.raise_geo_restricted(clean_html(err) || err, { countries: ZanIE._GEO_COUNTRIES });

    const csrf = this._html_search_meta('csrf-token', webpage, null, false);
    const pct = this._html_search_meta('vod-pct', webpage, null, false);
    const token = this._html_search_meta('live-player-token', webpage, null, false);
    if (!csrf || !pct || !token) this.raise_login_required();

    const status = await this._download_json<Record<string, any>>(
      `${ZanIE._BASE_URL}/api/live/${videoId}/getLiveStatus`,
      videoId,
      undefined,
      {
        headers: { 'X-Csrf-Token': csrf },
        data: new URLSearchParams({ pct, token }).toString(),
      },
    );
    if (!status?.isSuccess) throw new ExtractorError('Unexpected error');

    const result = (status.result || {}) as Record<string, any>;
    if (result.isFinished !== false) {
      throw new ExtractorError('This video is no longer available', { expected: true });
    }
    if (result.canPlay !== true) {
      throw new ExtractorError('Ticket has expired', { expected: true });
    }

    const isLive = !result.isVod;
    const releaseTimestamp = parse_iso8601(
      this._html_search_meta('open-live-date', webpage, null, false) || undefined,
    );
    const srvTime = int_or_none(status.srvTime) || 0;
    if (isLive && releaseTimestamp && srvTime < releaseTimestamp) {
      this.raise_no_formats('This livestream has not yet started', true);
    }

    const m3u8Url = this._html_search_meta('live-url', webpage);
    const formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native');

    return {
      id: videoId,
      formats,
      is_live: isLive,
      release_timestamp: releaseTimestamp ?? undefined,
      alt_title: clean_html(this._og_search_title(webpage, undefined, false) || '') || undefined,
      title:
        clean_html(
          this._search_regex(
            /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/,
            webpage,
            'title',
            videoId,
            false,
            1,
          ) || '',
        ) || videoId,
      thumbnail: this._og_search_thumbnail(webpage, undefined, false) || undefined,
      description:
        clean_html(
          this._search_regex(
            /<[^>]+class=["'][^"']*(?:p-eventinfo__detail|groupDetail)[^"']*["'][^>]*>(?<d>[\s\S]*?)<\/[^>]+>/,
            webpage,
            'description',
            null,
            false,
            'd',
          ) || '',
        ) || undefined,
      duration: int_or_none(str_or_none(result.duration)) ?? undefined,
    };
  }
}
