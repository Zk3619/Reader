/** PacktPubBaseIE / PacktPubIE / PacktPubCourseIE — ported from yt-dlp packtpub.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, str_or_none } from '../../utils';
import { strip_or_none } from './_helpers';

export class PacktPubBaseIE extends InfoExtractor {
  static IE_NAME = 'packtpubbase';
  static _VALID_URL: RegExp | string | false | null = false;
  protected static _STATIC_PRODUCTS_BASE = 'https://static.packt-cdn.com/products/';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PacktPubBaseIE is not a standalone extractor', { expected: true });
  }
}

export class PacktPubIE extends PacktPubBaseIE {
  static IE_NAME = 'packtpub';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?packtpub\.com\/mapt|subscription\.packtpub\.com)\/video\/[^/]+\/(?<course_id>\d+)\/(?<chapter_id>[^/]+)\/(?<id>[^/]+)(?:\/(?<display_id>[^/?&#]+))?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const courseId = m.groups?.course_id!;
    const chapterId = m.groups?.chapter_id!;
    const videoId = m.groups?.id!;
    const displayId = m.groups?.display_id;

    const headers: Record<string, string> = {};
    const token = (this as unknown as { _TOKEN?: string })._TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    let videoUrl: string;
    try {
      const resp = await this._download_json<{ data: string }>(
        `https://services.packtpub.com/products-v1/products/${courseId}/${chapterId}/${videoId}`,
        videoId,
        'Downloading JSON video',
        { headers },
      );
      videoUrl = resp.data;
    } catch (e) {
      if (e instanceof ExtractorError) this.raise_login_required('This video is locked');
      throw e;
    }

    const formats: Format[] = [{ url: videoUrl, format_id: 'http', ext: 'mp4' }];
    return {
      id: videoId,
      formats,
      title: displayId || videoId,
    };
  }
}

export class PacktPubCourseIE extends PacktPubBaseIE {
  static IE_NAME = 'packtpub:course';
  static _VALID_URL =
    /(?<url>https?:\/\/(?:(?:www\.)?packtpub\.com\/mapt|subscription\.packtpub\.com)\/video\/[^/]+\/(?<id>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const baseUrl = m.groups?.url!;
    const courseId = m.groups?.id!;

    const course = await this._download_json<{ chapters?: Array<Record<string, unknown>> }>(
      `${PacktPubBaseIE._STATIC_PRODUCTS_BASE}${courseId}/toc`,
      courseId,
    );
    const metadata =
      (await this._download_json<Record<string, unknown>>(
        `${PacktPubBaseIE._STATIC_PRODUCTS_BASE}${courseId}/summary`,
        courseId,
        undefined,
        { fatal: false },
      )) || {};

    const entries: VideoInfo[] = [];
    for (const [chapterNum, chapter] of (course.chapters || []).entries()) {
      const chapterId = str_or_none(chapter.id);
      const sections = chapter.sections;
      if (!chapterId || !Array.isArray(sections)) continue;
      const chapterInfo = {
        chapter: chapter.title as string | undefined,
        chapter_number: chapterNum + 1,
        chapter_id: chapterId,
      };
      for (const section of sections) {
        const sectionId = str_or_none(section.id);
        if (!sectionId || section.contentType !== 'video') continue;
        entries.push({
          id: sectionId,
          _type: 'url_transparent',
          url: [baseUrl, chapterId, sectionId].join('/'),
          title: strip_or_none(section.title) ?? undefined,
          description: clean_html(str_or_none(section.summary)) ?? undefined,
          thumbnail: str_or_none(metadata.coverImage) ?? undefined,
          ie_key: 'packtpub',
          ...chapterInfo,
        });
      }
    }

    return this.playlist_result(entries, courseId, str_or_none(metadata.title) ?? undefined, clean_html(str_or_none(metadata.about)) ?? undefined);
  }
}
