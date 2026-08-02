/** RbgTum* — ported from yt-dlp rbgtum.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { remove_start, parse_qs } from '../../utils';
import { htmlExtractTitle } from './_helpers';

export class RbgTumIE extends InfoExtractor {
  static IE_NAME = 'RbgTum';
  static _VALID_URL = /https?:\/\/(?:live\.rbg\.tum\.de|tum\.live)\/w\/(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const m3u8 = this._html_search_regex(/"(https:\/\/[^"]+\.m3u8[^"]*)/, webpage, 'm3u8')!;
    const lectureTitle = this._html_search_regex(/<h1[^>]*>([^<]+)<\/h1>/, webpage, 'title', null, false);
    const lectureSeriesTitle = remove_start(htmlExtractTitle(webpage) || '', 'TUM-Live | ');
    const formats = await this._extract_m3u8_formats(m3u8, videoId, 'mp4', 'm3u8_native', 'hls');
    return {
      id: videoId,
      title: lectureTitle ?? undefined,
      series: lectureSeriesTitle || undefined,
      formats,
    };
  }
}

export class RbgTumCourseIE extends InfoExtractor {
  static IE_NAME = 'RbgTumCourse';
  static _VALID_URL =
    /https?:\/\/(?<hostname>(?:live\.rbg\.tum\.de|tum\.live))\/old\/course\/(?<id>(?<year>\d+)\/(?<term>\w+)\/(?<slug>[^/?#]+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const courseId = m.groups!.id!;
    const hostname = m.groups!.hostname!;
    const year = m.groups!.year!;
    const term = m.groups!.term!;
    const slug = m.groups!.slug!;

    const meta = (await this._download_json<Record<string, unknown>>(
      `https://${hostname}/api/courses/${slug}/`,
      courseId,
      undefined,
      { query: { year, term }, fatal: false },
    )) || {};

    let lectureSeriesTitle = meta.Name as string | undefined;
    let lectures: VideoInfo[] = ((meta.Streams as Array<Record<string, unknown>>) || []).map((s) =>
      this.url_result(`https://${hostname}/w/${slug}/${s.ID}`, 'RbgTum'),
    );

    if (!lectures.length) {
      const webpage = await this._download_webpage(url, courseId);
      lectureSeriesTitle = remove_start(htmlExtractTitle(webpage) || '', 'TUM-Live | ') || undefined;
      lectures = [...webpage.matchAll(/href="(\/w\/[^/"]+\/[^/"]+)"/g)].map((lm) =>
        this.url_result(`https://${hostname}${lm[1]}`, 'RbgTum'),
      );
    }

    return this.playlist_result(lectures, courseId, lectureSeriesTitle);
  }
}

export class RbgTumNewCourseIE extends InfoExtractor {
  static IE_NAME = 'RbgTumNewCourse';
  static _VALID_URL = /https?:\/\/(?<hostname>(?:live\.rbg\.tum\.de|tum\.live))\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = parse_qs(url);
    const errors = ['year', 'term', 'slug'].filter((k) => !query[k]?.[0]);
    if (errors.length) {
      throw new ExtractorError(`Input URL is missing query parameters: ${errors.join(', ')}`);
    }
    const year = query.year![0]!;
    const term = query.term![0]!;
    const slug = query.slug![0]!;
    const hostname = this._match_valid_url(url)!.groups!.hostname!;
    return this.url_result(`https://${hostname}/old/course/${year}/${term}/${slug}`, 'RbgTumCourse');
  }
}
