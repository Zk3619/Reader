/**
 * ITProTVBaseIE / ITProTVIE / ITProTVCourseIE — ported from yt-dlp itprotv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj } from '../../utils';
import { urljoin } from './_helpers';

export class ITProTVBaseIE extends InfoExtractor {
  static IE_NAME = 'itprotvbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _ENDPOINTS: Record<string, string> = {
    course: 'course?url={}&brand=00002560-0000-3fa9-0000-1d61000035f3',
    episode: 'brand/00002560-0000-3fa9-0000-1d61000035f3/episode?url={}',
  };

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ITProTVBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    ep: string,
    itemId: string,
    webpage: string,
  ): Promise<Record<string, unknown>> {
    const jwt = this._search_regex(/{"passedToken":"([\w-]+\.[\w-]+\.[\w-]+)",/, webpage, 'jwt')!;
    const resp = await this._download_json<Record<string, unknown>>(
      `https://api.itpro.tv/api/urza/v3/consumer-web/${this._ENDPOINTS[ep]!.replace('{}', itemId)}`,
      itemId,
      `Fetching ${ep} data API`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    return (resp[ep] as Record<string, unknown>) || {};
  }

  protected _checkIfLoggedIn(webpage: string): void {
    if (/{\s*member\s*:\s*null/.test(webpage)) this.raise_login_required();
  }
}

export class ITProTVIE extends ITProTVBaseIE {
  static IE_NAME = 'itprotv';
  static _VALID_URL =
    /https?:\/\/app\.itpro\.tv\/course\/(?<course>[\w-]+)\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const episodeId = m.groups!.id!;
    const courseName = m.groups!.course!;
    const webpage = await this._download_webpage(url, episodeId);
    this._checkIfLoggedIn(webpage);

    const course = await this._callApi('course', courseName, webpage);
    const episode = await this._callApi('episode', episodeId, webpage);

    let chapterNumber: number | undefined;
    let chapter: Record<string, unknown> | undefined;
    for (const [i, topic] of ((course.topics as unknown[]) || []).entries()) {
      if (traverse_obj(topic, ['id']) === episode.topic) {
        chapterNumber = i + 1;
        chapter = topic as Record<string, unknown>;
        break;
      }
    }

    const formats: Format[] = [];
    for (const h of [320, 480, 720, 1080]) {
      const embed = episode[`jwVideo${h}Embed`];
      if (embed) formats.push({ format_id: `${h}p`, url: String(embed), height: h });
    }

    const subtitles: Record<string, Subtitle[]> | undefined = episode.enCaptionData
      ? { en: [{ ext: 'vtt', data: String(episode.enCaptionData) }] }
      : undefined;

    return {
      id: episodeId,
      title: episode.title != null ? String(episode.title) : episodeId,
      description: episode.description != null ? String(episode.description) : undefined,
      thumbnail: episode.thumbnail != null ? String(episode.thumbnail) : undefined,
      formats,
      duration: int_or_none(episode.length) ?? undefined,
      series: course.name != null ? String(course.name) : undefined,
      series_id: course.url != null ? String(course.url) : undefined,
      chapter: str_or_none(chapter?.title) ?? undefined,
      chapter_number: chapterNumber,
      chapter_id: str_or_none(chapter?.id) ?? undefined,
      subtitles,
    };
  }
}

export class ITProTVCourseIE extends ITProTVBaseIE {
  static IE_NAME = 'itprotv:course';
  static _VALID_URL = /https?:\/\/app\.itpro\.tv\/course\/(?<id>[\w-]+)\/?(?:$|[#?])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseId = this._match_id(url);
    const webpage = await this._download_webpage(url, courseId);
    this._checkIfLoggedIn(webpage);
    const course = await this._callApi('course', courseId, webpage);

    const entries = ((course.episodes as Array<Record<string, unknown>>) || []).map((episode) =>
      this.url_result(
        urljoin(url, `${courseId}/${episode.url}`),
        'ITProTV',
        String(episode.url ?? ''),
        episode.title != null ? String(episode.title) : null,
      ),
    );

    return this.playlist_result(
      entries,
      courseId,
      course.name != null ? String(course.name) : courseId,
      course.description != null ? String(course.description) : null,
    );
  }
}
