/** PlatziBaseIE / PlatziIE / PlatziCourseIE — ported from yt-dlp platzi.py (login omitted) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class PlatziBaseIE extends InfoExtractor {
  static IE_NAME = 'platzibase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('PlatziBaseIE is not a standalone extractor', { expected: true });
  }
}

export class PlatziIE extends PlatziBaseIE {
  static IE_NAME = 'platzi';
  static _VALID_URL =
    /https?:\/\/(?:platzi\.com\/clases|courses\.platzi\.com\/classes)\/[^/]+\/(?<id>\d+)-[^/?#&]+/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const lectureId = this._match_id(url);
    const webpage = await this._download_webpage(url, lectureId);
    const clientData = this._parse_json(
      this._search_regex(/client_data\s*=\s*(\{.+?\})\s*;(?:\s*\n|$)/, webpage, 'client data')!,
      lectureId,
    ) as { initialState?: { material?: Record<string, unknown> } };

    const material = clientData.initialState?.material || {};
    const desc = (material.description as Record<string, unknown>) || {};
    const title = str_or_none(desc.title) ?? undefined;
    const formats: Format[] = [];

    for (const server of Object.values((material.videos as Record<string, unknown>) || {})) {
      if (!server || typeof server !== 'object') continue;
      for (const formatId of ['hls', 'dash'] as const) {
        const formatUrl = url_or_none((server as Record<string, unknown>)[formatId]);
        if (!formatUrl) continue;
        if (formatId === 'hls') {
          const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, lectureId, formatId);
          formats.push(...res.formats);
        }
      }
    }

    const content = str_or_none(desc.content);
    const description = content ? clean_html(atob(content)) : undefined;

    return {
      id: lectureId,
      title,
      description: description ?? undefined,
      duration: int_or_none(material.duration, 60) ?? undefined,
      formats,
    };
  }
}

export class PlatziCourseIE extends PlatziBaseIE {
  static IE_NAME = 'platzi:course';
  static _VALID_URL =
    /https?:\/\/(?:platzi\.com\/clases|courses\.platzi\.com\/classes)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseName = this._match_id(url);
    const webpage = await this._download_webpage(url, courseName);
    const props = this._parse_json(this._search_regex(/data\s*=\s*(\{.+?\})\s*;/, webpage, 'data')!, courseName) as {
      initialProps?: Record<string, unknown>;
    };
    const initialProps = props.initialProps || {};
    const entries: VideoInfo[] = [];

    for (const [chapterNum, chapter] of ((initialProps.concepts as Array<Record<string, unknown>>) || []).entries()) {
      if (!chapter || typeof chapter !== 'object') continue;
      const materials = chapter.materials;
      if (!Array.isArray(materials)) continue;
      const chapterTitle = str_or_none(chapter.title);
      const chapterId = str_or_none(chapter.id);
      for (const material of materials) {
        if (!material || typeof material !== 'object' || material.material_type !== 'video') continue;
        const videoUrl = url_or_none(material.url);
        if (!videoUrl) continue;
        entries.push({
          _type: 'url_transparent',
          url: new URL(videoUrl, url).href,
          title: str_or_none(material.name) ?? undefined,
          id: str_or_none(material.id) || String(material.id ?? entries.length),
          ie_key: 'platzi',
          chapter: chapterTitle ?? undefined,
          chapter_number: chapterNum + 1,
          chapter_id: chapterId ?? undefined,
        });
      }
    }

    const course = (initialProps.course as Record<string, unknown>) || {};
    return this.playlist_result(entries, String(course.id ?? courseName), str_or_none(course.name) ?? undefined);
  }
}
