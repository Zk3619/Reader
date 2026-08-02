/**
 * DWIE / DWArticleIE — ported from yt-dlp dw.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, unified_strdate, url_or_none } from '../../utils';
import { extractSmilMediaUrls, hiddenInputs } from './_helpers';

export class DWIE extends InfoExtractor {
  static IE_NAME = 'dw';
  static _VALID_URL = /https?:\/\/(?:www\.)?dw\.com\/(?:[^/]+\/)+(?:av|e)-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let mediaId = this._match_id(url);
    const webpage = await this._download_webpage(url, mediaId);
    const inputs = hiddenInputs(webpage);
    const title = inputs.media_title || mediaId;
    mediaId = inputs.media_id || mediaId;

    let formats: Format[] = [];
    const directUrl = url_or_none(inputs.file_name);
    if (directUrl) {
      formats = [{ format_id: 'direct', url: directUrl }];
    } else {
      const smilUrl = `http://www.dw.com/smil/v-${mediaId}`;
      let smilXml = await this._download_webpage(smilUrl, mediaId);
      smilXml = smilXml.replace('rtmp://tv-od.dw.de/flash/', 'http://tv-download.dw.de/dwtv_video/flv/');
      for (const mediaUrl of extractSmilMediaUrls(smilXml)) {
        formats.push({ format_id: 'smil', url: mediaUrl });
      }
    }

    let uploadDate: string | undefined = inputs.display_date
      ? unified_strdate(inputs.display_date) ?? undefined
      : undefined;
    if (!uploadDate) {
      const dateMatch = webpage.match(/<span[^>]+class="date">([0-9.]+)\s*\|/);
      uploadDate = unified_strdate(dateMatch?.[1]) ?? undefined;
    }

    return {
      id: mediaId,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: inputs.preview_image || undefined,
      duration: int_or_none(inputs.file_duration) ?? undefined,
      upload_date: uploadDate,
      formats,
    };
  }
}

export class DWArticleIE extends InfoExtractor {
  static IE_NAME = 'dw:article';
  static _VALID_URL = /https?:\/\/(?:www\.)?dw\.com\/(?:[^/]+\/)+\ba-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const webpage = await this._download_webpage(url, articleId);
    const inputs = hiddenInputs(webpage);
    const mediaId = inputs.media_id!;
    const mediaPath = this._search_regex(
      new RegExp(`href="([^"]+av-${mediaId})"\\s+class="overlayLink"`),
      webpage,
      'media url',
    )!;
    const mediaUrl = new URL(mediaPath, url).href;
    return this.url_result(mediaUrl, 'DW', mediaId);
  }
}
