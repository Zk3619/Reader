/** Safari family ù?ported from yt-dlp safari.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { update_url_query } from '../../utils';

export class SafariBaseIE extends InfoExtractor {
  static IE_NAME = 'safari:base';
  static _NETRC_MACHINE = 'safari';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _LOGIN_URL = 'https://learning.oreilly.com/accounts/login/';
  static _API_BASE = 'https://learning.oreilly.com/api/v1';
  static LOGGED_IN = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('SafariBaseIE is not a standalone extractor', { expected: true });
  }
}

export class SafariIE extends SafariBaseIE {
  static IE_NAME = 'safari';
  static IE_DESC = 'safaribooksonline.com online video';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:safaribooksonline|(?:learning\.)?oreilly)\.com\/(?:library\/view\/[^/]+\/(?<course_id>[^/]+)\/(?<part>[^/?#&]+)\.html|videos\/[^/]+\/[^/]+\/(?<reference_id>[^-]+-[^/?#&]+))/;

  static _PARTNER_ID = '1926081';
  static _UICONF_ID = '29375172';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let referenceId = m.groups?.reference_id;
    let partnerId = SafariIE._PARTNER_ID;
    let uiId = SafariIE._UICONF_ID;
    let videoId: string;

    if (referenceId) {
      videoId = referenceId;
    } else {
      videoId = `${m.groups!.course_id}-${m.groups!.part}`;
      const webpage = await this._download_webpage(url, videoId);
      referenceId =
        this._search_regex(/data-reference-id=(["'])(?<id>(?:(?!\1).)+)\1/, webpage, 'kaltura reference id', undefined, true, 'id') ||
        undefined;
      partnerId =
        this._search_regex(/data-partner-id=(["'])(?<id>(?:(?!\1).)+)\1/, webpage, 'kaltura widget id', SafariIE._PARTNER_ID, false, 'id') ||
        SafariIE._PARTNER_ID;
      uiId =
        this._search_regex(/data-ui-id=(["'])(?<id>(?:(?!\1).)+)\1/, webpage, 'kaltura uiconf id', SafariIE._UICONF_ID, false, 'id') ||
        SafariIE._UICONF_ID;
    }

    const query: Record<string, string> = {
      wid: `_${partnerId}`,
      uiconf_id: uiId,
      'flashvars[referenceId]': referenceId!,
    };

    if (SafariBaseIE.LOGGED_IN) {
      const kalturaSession = await this._download_json<{ session?: string }>(
        `${SafariBaseIE._API_BASE}/player/kaltura_session/?reference_id=${referenceId}`,
        videoId,
        'Downloading kaltura session JSON',
        { fatal: false, headers: { Accept: 'application/json' } },
      );
      if (kalturaSession?.session) query['flashvars[ks]'] = kalturaSession.session;
    }

    return this.url_result(
      update_url_query('https://cdnapisec.kaltura.com/html5/html5lib/v2.37.1/mwEmbedFrame.php', query),
      'Kaltura',
      videoId,
    );
  }
}

export class SafariApiIE extends SafariBaseIE {
  static IE_NAME = 'safari:api';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:safaribooksonline|(?:learning\.)?oreilly)\.com\/api\/v1\/book\/(?<course_id>[^/]+)\/chapter(?:-content)?\/(?<part>[^/?#&]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const part = await this._download_json<Record<string, unknown>>(
      url,
      `${m.groups!.course_id}/${m.groups!.part}`,
      'Downloading part JSON',
    );
    let webUrl = String(part.web_url || '');
    if (webUrl.includes('library/view')) {
      webUrl = webUrl.replace('library/view', 'videos');
      const naturalKeys = part.natural_key as string[];
      const lastSlash = webUrl.lastIndexOf('/');
      webUrl = `${webUrl.slice(0, lastSlash)}/${naturalKeys[0]}-${naturalKeys[1]!.slice(0, -5)}`;
    }
    return this.url_result(webUrl, 'Safari');
  }
}

export class SafariCourseIE extends SafariBaseIE {
  static IE_NAME = 'safari:course';
  static IE_DESC = 'safaribooksonline.com online courses';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?(?:safaribooksonline|(?:learning\.)?oreilly)\.com\/(?:library\/view\/[^/]+|api\/v1\/book|videos\/[^/]+)|techbus\.safaribooksonline\.com)\/(?<id>[^/]+)/;

  static suitable(url: string): boolean {
    if (SafariIE.suitable(url) || SafariApiIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const courseId = this._match_id(url);
    const courseJson = await this._download_json<Record<string, unknown>>(
      `${SafariBaseIE._API_BASE}/book/${courseId}/?override_format=json`,
      courseId,
      'Downloading course JSON',
    );
    const chapters = courseJson.chapters as string[] | undefined;
    if (!chapters) throw new ExtractorError(`No chapters found for course ${courseId}`, { expected: true });
    const entries = chapters.map((chapter) => this.url_result(chapter, 'Safari:api'));
    return this.playlist_result(entries, courseId, courseJson.title as string | undefined);
  }
}
