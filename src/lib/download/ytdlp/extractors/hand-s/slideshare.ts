/** SlideshareIE — ported from yt-dlp slideshare.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { get_element_by_id } from '../../utils';

export class SlideshareIE extends InfoExtractor {
  static IE_NAME = 'slideshare';
  static _VALID_URL = /https?:\/\/(?:www\.)?slideshare\.net\/[^/]+?\/(?<title>.+?)($|\?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageTitle = this._match_valid_url(url)!.groups!.title!;
    const webpage = await this._download_webpage(url, pageTitle);
    const slideshareObj = this._search_regex(
      /\$\.extend\(.*?slideshare_object,\s*(\{.*?\})\);/s,
      webpage,
      'slideshare object',
    )!;
    const info = this._parse_json<Record<string, unknown>>(slideshareObj, pageTitle)!;
    const slideshow = info.slideshow as Record<string, unknown>;
    if (slideshow?.type !== 'video') {
      throw new ExtractorError(
        `Webpage type is "${slideshow?.type}": only video extraction is supported for Slideshare`,
        { expected: true },
      );
    }
    const doc = String(info.doc);
    const jsplayer = info.jsplayer as Record<string, string>;
    const bucket = jsplayer.video_bucket;
    const ext = jsplayer.video_extension;
    const videoUrl = new URL(`${doc}-SD.${ext}`, bucket).toString();
    const descEl =
      get_element_by_id('slideshow-description-paragraph', webpage) ||
      this._html_search_regex(
        /<p[^>]+itemprop="description"[^>]*>(.+?)<\/p>/s,
        webpage,
        'description',
        null,
        false,
      );
    const description = descEl?.trim() || undefined;
    return {
      id: String(slideshow.id),
      title: String(slideshow.title),
      ext,
      url: videoUrl,
      thumbnail: String(slideshow.pin_image_url) || undefined,
      description,
    };
  }
}
