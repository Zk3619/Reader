/**
 * GameDevTVDashboardIE — ported from yt-dlp gamedevtv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  join_nonempty,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

export class GameDevTVDashboardIE extends InfoExtractor {
  static IE_NAME = 'gamedevtvdashboard';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?gamedev\.tv\/dashboard\/courses\/(?<course_id>\d+)(?:\/(?<lecture_id>\d+))?/;
  static _NETRC_MACHINE = 'gamedevtv';

  protected _API_HEADERS: Record<string, string> = {};

  protected async _perform_login(username: string, password: string): Promise<void> {
    try {
      const response = await this._download_json<{ token_type?: string; access_token?: string }>(
        'https://api.gamedev.tv/api/students/login',
        undefined,
        'Logging in',
        {
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ email: username, password, cart_items: [] }),
        },
      );
      this._API_HEADERS.Authorization = `${response.token_type} ${response.access_token}`;
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/401/.test(msg)) throw new ExtractorError('Invalid username/password', { expected: true });
      throw e;
    }
  }

  protected async _real_initialize(): Promise<void> {
    if (!this._API_HEADERS.Authorization) {
      this.raise_login_required('This content is only available with purchase', 'password');
    }
  }

  protected async *_entries(
    data: Record<string, unknown>,
    courseId: string,
    courseInfo: Partial<VideoInfo>,
    selectedLecture?: string,
  ): AsyncGenerator<VideoInfo> {
    const sections = traverse_obj(data, ['sections', 'ALL']) as Array<Record<string, unknown>> | undefined;
    for (const section of sections || []) {
      const sectionInfo = {
        season_id: str_or_none(traverse_obj(section, ['id'])),
        season: str_or_none(traverse_obj(section, ['title'])),
        season_number: int_or_none(traverse_obj(section, ['order'])) ?? undefined,
      };
      const lectures = (section.lectures as Array<Record<string, unknown>>) || [];
      for (const lecture of lectures) {
        const playListUrl = url_or_none(traverse_obj(lecture, ['video', 'playListUrl']));
        if (!playListUrl) continue;
        if (selectedLecture && String(lecture.id) !== selectedLecture) continue;

        const displayId = join_nonempty(courseId, sectionInfo.season_id, String(lecture.id ?? ''));
        const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, playListUrl, displayId, 'hls');

        yield {
          ...courseInfo,
          ...sectionInfo,
          id: displayId,
          display_id: displayId,
          formats,
          subtitles,
          series: courseInfo.title,
          series_id: courseId,
          id_override: str_or_none(traverse_obj(lecture, ['video', 'guid'])),
          title: str_or_none(traverse_obj(lecture, ['title'])) || undefined,
          alt_title: str_or_none(traverse_obj(lecture, ['video', 'title'])) || undefined,
          description: clean_html(String(lecture.description ?? '')) || undefined,
          episode: str_or_none(traverse_obj(lecture, ['title'])) || undefined,
          episode_number: int_or_none(traverse_obj(lecture, ['order'])) ?? undefined,
          duration: int_or_none(traverse_obj(lecture, ['video', 'duration_in_sec'])) ?? undefined,
          timestamp: parseIso8601(traverse_obj(lecture, ['video', 'created_at']) as string | undefined) ?? undefined,
          modified_timestamp:
            parseIso8601(traverse_obj(lecture, ['video', 'updated_at']) as string | undefined) ?? undefined,
          thumbnail: url_or_none(traverse_obj(lecture, ['video', 'thumbnailUrl'])) ?? undefined,
        } as VideoInfo & { id_override?: string };
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const m = this._match_valid_url(url)!;
    const courseId = m.groups!.course_id!;
    const lectureId = m.groups!.lecture_id;

    const data = (
      await this._download_json<{ data: Record<string, unknown> }>(
        `https://api.gamedev.tv/api/courses/my/${courseId}`,
        courseId,
        undefined,
        { headers: this._API_HEADERS },
      )
    ).data;

    const courseInfo: Partial<VideoInfo> = {
      title: str_or_none(traverse_obj(data, ['title'])) || undefined,
      tags: traverse_obj(data, ['tags', 'ALL', 'name']) as string[] | undefined,
      categories: traverse_obj(data, ['categories', 'ALL', 'title']) as string[] | undefined,
      timestamp: parseIso8601(traverse_obj(data, ['created_at']) as string | undefined) ?? undefined,
      modified_timestamp:
        parseIso8601(traverse_obj(data, ['updated_at']) as string | undefined) ?? undefined,
      thumbnail: url_or_none(traverse_obj(data, ['image'])) ?? undefined,
    };

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(data, courseId, courseInfo, lectureId)) {
      const e = entry as VideoInfo & { id_override?: string };
      if (e.id_override) e.id = e.id_override;
      delete (e as { id_override?: string }).id_override;
      entries.push(e);
      if (lectureId) return e;
    }

    if (lectureId) throw new ExtractorError('Lecture not found');
    return this.playlist_result(entries, courseId, courseInfo.title, undefined);
  }
}
