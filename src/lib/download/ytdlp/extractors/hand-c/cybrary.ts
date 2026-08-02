/**
 * CybraryBaseIE / CybraryIE / CybraryCourseIE — ported from yt-dlp cybrary.py
 * Login flow (_perform_login) is not portable to this runtime; every API
 * call requires a Bearer token upstream too, so anonymous extraction
 * raises login-required, matching yt-dlp's behavior without stored auth.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url, str_or_none, traverse_obj } from '../../utils';

const ENDPOINTS: Record<string, string> = {
  course: 'https://app.cybrary.it/courses/api/catalog/browse/course/{}',
  course_enrollment: 'https://app.cybrary.it/courses/api/catalog/{}/enrollment',
  enrollment: 'https://app.cybrary.it/courses/api/enrollment/{}',
  launch: 'https://app.cybrary.it/courses/api/catalog/{}/launch',
};

export class CybraryBaseIE extends InfoExtractor {
  static IE_NAME = 'cybrarybase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'cybrary';
  protected static _TOKEN: string | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CybraryBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(endpoint: string, itemId: string): Promise<Record<string, unknown>> {
    const token = (this.constructor as typeof CybraryBaseIE)._TOKEN;
    if (!token) this.raise_login_required(undefined, undefined, 'password');
    return this._download_json<Record<string, unknown>>(
      ENDPOINTS[endpoint]!.replace('{}', itemId),
      itemId,
      `Downloading ${endpoint} JSON metadata`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  }

  protected async _getVimeoId(activityId: string): Promise<string | null> {
    const launchApi = await this._callApi('launch', activityId);
    const launchUrl = str_or_none(launchApi.url);
    if (launchUrl) {
      return this._search_regex(/https?:\/\/player\.vimeo\.com\/video\/(?<vimeo_id>[0-9]+)/, launchUrl, 'vimeo_id');
    }
    const activities = traverse_obj(launchApi, ['vendor_data', 'content']);
    if (Array.isArray(activities)) {
      for (const item of activities) {
        const vid = (item as Record<string, unknown>)?.videoId;
        if (vid != null) return String(vid);
      }
    }
    return null;
  }
}

export class CybraryIE extends CybraryBaseIE {
  static IE_NAME = 'cybrary';
  static _VALID_URL = /https?:\/\/app\.cybrary\.it\/immersive\/(?<enrollment>[0-9]+)\/activity\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const activityId = m.groups!.id!;
    const enrollmentId = m.groups!.enrollment!;
    const course = ((await this._callApi('enrollment', enrollmentId)).content as Record<string, unknown>) || {};

    const learningModules = Array.isArray(course.learning_modules) ? (course.learning_modules as Record<string, unknown>[]) : [];
    let activity: Record<string, unknown> | null = null;
    let module: Record<string, unknown> | null = null;
    for (const mod of learningModules) {
      const activities = Array.isArray(mod.activities) ? (mod.activities as Record<string, unknown>[]) : [];
      const found = activities.find((a) => Number(activityId) === a.id);
      if (found) {
        activity = found;
        module = mod;
        break;
      }
    }

    if (!activity || !['Video Activity', 'Lesson Activity'].includes(String(activity.type))) {
      throw new ExtractorError('The activity is not a video', { expected: true });
    }

    const vimeoId = await this._getVimeoId(activityId);
    const contentDescription = (course.content_description as Record<string, unknown>) || {};

    return {
      _type: 'url_transparent',
      series: str_or_none(contentDescription.title) ?? undefined,
      series_id: str_or_none(contentDescription.id) ?? undefined,
      id: vimeoId || activityId,
      chapter: str_or_none(module?.title) ?? undefined,
      chapter_id: str_or_none(module?.id) ?? undefined,
      title: str_or_none(activity.title) ?? undefined,
      url: smuggle_url(`https://player.vimeo.com/video/${vimeoId}`, { referer: 'https://api.cybrary.it' }),
    };
  }
}

export class CybraryCourseIE extends CybraryBaseIE {
  static IE_NAME = 'cybrary:course';
  static _VALID_URL = /https?:\/\/app\.cybrary\.it\/browse\/course\/(?<id>[\w-]+)\/?(?:$|[#?])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseId = this._match_id(url);
    const course = await this._callApi('course', courseId);
    const enrollmentInfo = await this._callApi('course_enrollment', String(course.id));

    const contentItem = (course.content_item as Record<string, unknown>) || {};
    const modules = Array.isArray(contentItem.learning_modules) ? (contentItem.learning_modules as Record<string, unknown>[]) : [];
    const entries: VideoInfo[] = [];
    for (const mod of modules) {
      const activities = Array.isArray(mod.activities) ? (mod.activities as Record<string, unknown>[]) : [];
      for (const activity of activities) {
        entries.push(this.url_result(`https://app.cybrary.it/immersive/${enrollmentInfo.id}/activity/${activity.id}`));
      }
    }

    return this.playlist_result(
      entries,
      str_or_none(contentItem.id) ?? undefined,
      str_or_none(course.title) ?? undefined,
      str_or_none(course.short_description) ?? undefined,
    );
  }
}
