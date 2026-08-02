/**
 * MyVideoGeIE — ported from yt-dlp myvideoge.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  get_element_by_class,
  get_element_by_id,
  int_or_none,
  js_to_json,
  unified_strdate,
} from '../../utils';
import { parseJwplayerFormats } from './_helpers';

const MONTH_NAMES_KA = [
  'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო',
  'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი',
];
const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
];

function qualityRank(id: string): number {
  if (id === 'HD') return 1;
  if (id === 'SD') return 0;
  return -1;
}

export class MyVideoGeIE extends InfoExtractor {
  static IE_NAME = 'myvideoge';
  static _VALID_URL = /https?:\/\/(?:www\.)?myvideo\.ge\/v\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const title =
      this._og_search_title(webpage) ||
      clean_html(get_element_by_class('my_video_title', webpage) || '') ||
      this._html_search_regex(/<title\b[^>]*>([^<]+)<\/title\b/i, webpage, 'title') ||
      undefined;

    const sourcesRaw = this._search_regex(
      /jwplayer\s*\(\s*['"]mvplayer['"]\s*\)\s*\.\s*setup\s*\([\s\S]*?\bsources\s*:\s*(\[[\s\S]*?\])\s*[,});]/,
      webpage,
      'jwplayer sources',
      null,
      false,
    );
    const jwplayerSources = sourcesRaw
      ? this._parse_json<unknown[]>(sourcesRaw, videoId, js_to_json, false)
      : [];
    const formats = await parseJwplayerFormats(this, jwplayerSources || [], videoId);
    for (const f of formats) {
      f.quality = qualityRank(String(f.format_id || ''));
    }

    const description =
      this._og_search_description(webpage) ||
      get_element_by_id('long_desc_holder', webpage) ||
      this._html_search_meta('description', webpage) ||
      undefined;

    const uploader = webpage.match(/<a[^>]+class="mv_user_name"[^>]*>([^<]+)</)?.[1]?.trim();

    let uploadDate = get_element_by_class('mv_vid_upl_date', webpage);
    if (uploadDate) {
      for (let i = 0; i < MONTH_NAMES_KA.length; i++) {
        uploadDate = uploadDate.replace(new RegExp(MONTH_NAMES_KA[i]!, 'gi'), MONTH_NAMES_EN[i]!);
      }
      uploadDate = unified_strdate(uploadDate);
    }

    return {
      id: videoId,
      title,
      description,
      uploader,
      formats,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      upload_date: uploadDate,
      view_count: int_or_none(get_element_by_class('mv_vid_views', webpage) || '') ?? undefined,
      like_count: int_or_none(get_element_by_id('likes_count', webpage) || '') ?? undefined,
      dislike_count: int_or_none(get_element_by_id('dislikes_count', webpage) || '') ?? undefined,
    };
  }
}
