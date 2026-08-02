/** PinkbikeIE — ported from yt-dlp pinkbike.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, remove_end, remove_start, str_to_int, unified_strdate } from '../../utils';

export class PinkbikeIE extends InfoExtractor {
  static IE_NAME = 'pinkbike';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?pinkbike\.com\/video\/|es\.pinkbike\.org\/i\/kvid\/kvid-y5\.swf\?id=)(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`http://www.pinkbike.com/video/${videoId}`, videoId);

    const formats: Format[] = [];
    for (const m of webpage.matchAll(/data-quality=(["'])(?<fid>.+?)\1[^>]+src=\1(?<src>.+?)\1/g)) {
      const formatId = m.groups!.fid!;
      const height = int_or_none(/^(\d+)[pP]$/.exec(formatId)?.[1]);
      formats.push({ url: m.groups!.src!, format_id: formatId, height: height ?? undefined });
    }

    const title = remove_end(this._og_search_title(webpage) || '', ' Video - Pinkbike');
    const ogDesc = this._og_search_description(webpage);
    const description =
      this._html_search_regex(/id="media-description"[^>]*>([\s\S]+?)</, webpage, 'description', null, false) ||
      (ogDesc ? remove_start(ogDesc, `${title}. `) : null);

    const extractCount = (label: string): number | undefined =>
      str_to_int(
        this._html_search_regex(
          new RegExp(`<span[^>]+class="stat-num"[^>]*>([\\d,.]+)</span>\\s*<span[^>]+class="stat-label"[^>]*>${label}`),
          webpage,
          label,
          null,
          false,
        ),
      ) ?? undefined;

    return {
      id: videoId,
      title,
      description: description ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      duration: int_or_none(this._html_search_meta('video:duration', webpage, 'duration', false)) ?? undefined,
      upload_date: unified_strdate(this._search_regex(/class="fullTime"[^>]+title="([^"]+)"/, webpage, 'upload date', null, false)) ?? undefined,
      uploader: this._search_regex(/<a[^>]+\brel=["']author[^>]+>([^<]+)/, webpage, 'uploader', null, false) ?? undefined,
      location: this._html_search_regex(/<dt>Location<\/dt>\s*<dd>([\s\S]+?)</, webpage, 'location', null, false) ?? undefined,
      view_count: extractCount('Views'),
      comment_count: extractCount('Comments'),
      formats,
    };
  }
}
