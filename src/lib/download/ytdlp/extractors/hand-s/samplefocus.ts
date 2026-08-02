/** SampleFocusIE — ported from yt-dlp samplefocus.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extract_attributes, int_or_none } from '../../utils';
import { get_element_by_attribute } from './_helpers';

export class SampleFocusIE extends InfoExtractor {
  static IE_NAME = 'samplefocus';
  static _VALID_URL = /https?:\/\/(?:www\.)?samplefocus\.com\/samples\/(?<id>[^/?&#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const sampleId = this._search_regex(
      /<input[^>]+id=(["'])sample_id\1[^>]+value=(?:["'])(?<id>\d+)/,
      webpage,
      'sample id',
      undefined,
      true,
      'id',
    )!;

    const title =
      this._og_search_title(webpage, false) ||
      this._html_search_regex(/<h1>(.+?)<\/h1>/, webpage, 'title') ||
      displayId;

    let mp3Url = this._search_regex(
      /<input[^>]+id=(["'])sample_mp3\1[^>]+value=(["'])(?<url>(?:(?!\2).)+)/,
      webpage,
      'mp3',
      null,
      false,
      'url',
    );
    if (!mp3Url) {
      const metaTag = this._search_regex(
        /<meta[^>]+itemprop=(["'])contentUrl\1[^>]*>/,
        webpage,
        'mp3 url',
        undefined,
        true,
        0,
      )!;
      mp3Url = extract_attributes(metaTag).content;
    }

    const thumbnail =
      this._og_search_thumbnail(webpage) ||
      this._html_search_regex(
        /<img[^>]+class=(?:["'])waveform responsive-img[^>]+src=(["'])(?<url>(?:(?!\1).)+)/,
        webpage,
        'thumbnail',
        null,
        false,
        'url',
      ) ||
      undefined;

    const comments: Array<{ author?: string; author_id?: string; text?: string }> = [];
    for (const m of webpage.matchAll(
      /<p[^>]+class="comment-author"><a[^>]+href="\/users\/([^"]+)">([^"]+)<\/a>[\s\S]*?<p[^>]+class="comment-body">([^>]+)<\/p>/g,
    )) {
      comments.push({ author: m[2], author_id: m[1], text: m[3] });
    }

    let uploaderId: string | undefined;
    let uploader: string | undefined;
    const uploaderM = />By <a[^>]+href="\/users\/([^"]+)"[^>]*>([^<]+)/.exec(webpage);
    if (uploaderM) [uploaderId, uploader] = [uploaderM[1], uploaderM[2]];

    const breadcrumb = get_element_by_attribute('typeof', 'BreadcrumbList', webpage);
    const categories: string[] = [];
    if (breadcrumb) {
      for (const m of breadcrumb.matchAll(/<span[^>]+property=(["'])name\1[^>]*>([^<]+)/g)) {
        categories.push(m[2]!);
      }
    }

    const extractCount = (klass: string) =>
      int_or_none(
        this._html_search_regex(
          new RegExp(`<span[^>]+class=(?:["'])?${klass}-count[^>]*>(\\d+)`),
          webpage,
          klass,
          null,
          false,
        ),
      ) ?? undefined;

    const formats: Format[] = [
      {
        url: mp3Url!,
        ext: 'mp3',
        format_id: 'mp3',
        vcodec: 'none',
        acodec: 'mp3',
        http_headers: { Referer: url },
      },
    ];

    return {
      id: sampleId,
      title,
      formats,
      display_id: displayId,
      thumbnail,
      uploader,
      license: this._html_search_regex(
        /<a[^>]+href=(["'])\/license\1[^>]*>(?<license>[^<]+)</,
        webpage,
        'license',
        null,
        false,
        'license',
      ) || undefined,
      uploader_id: uploaderId,
      like_count: extractCount(`sample-${sampleId}-favorites`),
      comment_count: extractCount('comments'),
      comments,
      categories,
    };
  }
}
