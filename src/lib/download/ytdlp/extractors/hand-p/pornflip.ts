/** PornFlipIE — ported from yt-dlp pornflip.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { parse_iso8601 } from './_helpers';

export class PornFlipIE extends InfoExtractor {
  static IE_NAME = 'pornflip';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?pornflip\.com\/(?:(?:embed|sv|v)\/)?(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const host = 'www.pornflip.com';
    const webpage = await this._download_webpage(`https://${host}/sv/${videoId}`, videoId, undefined, {
      headers: { host },
    });

    const mpdUrl = this._search_regex(
      /"([^"]+userscontent.net\/dash\/[0-9]+\/manifest.mpd[^"]*)"/,
      webpage,
      'mpd_url',
    )!.replace(/&amp;/g, '&');
    const formats: Format[] = await this._extract_mpd_formats(mpdUrl, videoId, 'dash');

    return {
      age_limit: 18,
      description:
        this._html_search_regex(/&p\[summary\]=(.*?)\s*&p/, webpage, 'description', null, false) ?? undefined,
      dislike_count:
        int_or_none(
          this._html_search_regex(
            /class="btn btn-down-rating[^>]*>[^<]*<i[^>]*>[^<]*<\/i>[^>]*<span[^>]*>[^0-9]*([0-9]+)[^<0-9]*</,
            webpage,
            'dislike_count',
            null,
            false,
          ),
        ) ?? undefined,
      duration:
        parse_duration(
          this._search_regex(/"duration":\s+"([^"]+)",/, webpage, 'duration', null, false),
        ) ?? undefined,
      formats,
      id: videoId,
      like_count:
        int_or_none(
          this._html_search_regex(
            /class="btn btn-up-rating[^>]*>[^<]*<i[^>]*>[^<]*<\/i>[^>]*<span[^>]*>[^0-9]*([0-9]+)[^<0-9]*</,
            webpage,
            'like_count',
            null,
            false,
          ),
        ) ?? undefined,
      timestamp:
        parse_iso8601(
          this._search_regex(/"uploadDate":\s+"([^"]+)",/, webpage, 'upload_date', null, false),
        ) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      title:
        this._html_search_regex(/id="mediaPlayerTitleLink"[^>]*>(.+)<\/a>/, webpage, 'title', null, false) ??
        undefined,
      uploader:
        this._html_search_regex(/class="title-chanel"[^>]*>[^<]*<a[^>]*>([^<]+)</, webpage, 'uploader', null, false) ??
        undefined,
      view_count:
        int_or_none(
          this._search_regex(/"interactionCount":\s+"([^"]+)"/, webpage, 'view_count', null, false),
        ) ?? undefined,
    };
  }
}
