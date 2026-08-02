/** RayWenderlich* — ported from yt-dlp raywenderlich.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, merge_dicts, try_get, unescapeHTML, unified_timestamp, smuggle_url } from '../../utils';
import { urljoin } from './_helpers';

export class RayWenderlichIE extends InfoExtractor {
  static IE_NAME = 'RayWenderlich';
  static _VALID_URL =
    /https?:\/\/(?:videos\.raywenderlich\.com\/courses|(?:www\.)?raywenderlich\.com)\/(?<course_id>[^/]+)\/lessons\/(?<id>\d+)/;

  protected static _extractVideoId(data: Record<string, unknown> | null, lessonId: string): string | undefined {
    if (!data) return undefined;
    const contents = (try_get(data, (x) => x.contents) as Array<Record<string, unknown>>) || [];
    for (const content of contents) {
      if (int_or_none(content.ordinal) !== int_or_none(lessonId)) continue;
      const videoId = content.identifier;
      if (videoId) return String(videoId);
    }
    return undefined;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const courseId = m.groups!.course_id!;
    const lessonId = m.groups!.id!;
    const displayId = `${courseId}/${lessonId}`;
    const webpage = await this._download_webpage(url, displayId);

    const thumbnail =
      this._og_search_thumbnail(webpage) ||
      this._html_search_meta('twitter:image', webpage, 'thumbnail', false) ||
      undefined;

    if (webpage.includes('>Subscribe to unlock')) {
      throw new ExtractorError('This content is only available for subscribers', { expected: true });
    }

    const info: VideoInfo = { id: displayId, thumbnail };

    let vimeoId = this._search_regex(/data-vimeo-id=["'](\d+)/, webpage, 'vimeo id', null, false);

    if (!vimeoId) {
      const dataRaw = this._search_regex(/data-collection=(["'])(?<data>\{[\s\S]+?\})\1/, webpage, 'data collection', '{}', false, 'data');
      const data = this._parse_json(dataRaw || '{}', displayId, unescapeHTML, false) as Record<string, unknown>;
      const videoApiId =
        RayWenderlichIE._extractVideoId(data, lessonId) ||
        this._search_regex(/\/videos\/(\d+)\//, thumbnail || '', 'video id', null, false);
      const headers: Record<string, string> = { Referer: url, 'X-Requested-With': 'XMLHttpRequest' };
      const csrf = this._html_search_meta('csrf-token', webpage, 'csrf token', false);
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const videoResp = await this._download_json<{ video?: Record<string, unknown> }>(
        `https://videos.raywenderlich.com/api/v1/videos/${videoApiId}.json`,
        displayId,
        undefined,
        { headers },
      );
      const video = videoResp.video || {};
      const clips = (video.clips as Array<Record<string, unknown>>) || [];
      vimeoId = String(clips[0]?.provider_id || '');
      Object.assign(info, {
        _type: 'url_transparent',
        id: vimeoId,
        title: video.name as string | undefined,
        description: (video.description as string) || (video.meta_description as string) || undefined,
        duration: int_or_none(video.duration) ?? undefined,
        timestamp: unified_timestamp(video.created_at as string) ?? undefined,
      });
    }

    const vimeoUrl = smuggle_url(`https://player.vimeo.com/video/${vimeoId}`, { referer: url });
    return merge_dicts(info, this.url_result(vimeoUrl, 'Vimeo', vimeoId)) as VideoInfo;
  }
}

export class RayWenderlichCourseIE extends InfoExtractor {
  static IE_NAME = 'RayWenderlichCourse';
  static _VALID_URL =
    /https?:\/\/(?:videos\.raywenderlich\.com\/courses|(?:www\.)?raywenderlich\.com)\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseId = this._match_id(url);
    const webpage = await this._download_webpage(url, courseId);
    const entries: VideoInfo[] = [];
    const seen = new Set<string>();
    for (const m of webpage.matchAll(new RegExp(`<a[^>]+\\bhref=["'](/${courseId}/lessons/\\d+)`, 'g'))) {
      const lessonPath = m[1]!;
      if (seen.has(lessonPath)) continue;
      seen.add(lessonPath);
      entries.push(this.url_result(urljoin(url, lessonPath), 'RayWenderlich'));
    }
    const title =
      this._og_search_title(webpage) ||
      this._html_search_meta('twitter:title', webpage, 'title', false) ||
      undefined;
    return this.playlist_result(entries, courseId, title);
  }
}
