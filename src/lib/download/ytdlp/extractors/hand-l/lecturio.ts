/**
 * LecturioBaseIE / LecturioIE / LecturioCourseIE / LecturioDeCourseIE — ported from yt-dlp lecturio.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, str_or_none, url_or_none } from '../../utils';
import { urlencodePostdata, urljoin } from './_helpers';

export class LecturioBaseIE extends InfoExtractor {
  static IE_NAME = 'lecturiobase';
  static _VALID_URL: RegExp | string | false | null = false;
  static _NETRC_MACHINE = 'lecturio';

  protected _API_BASE_URL = 'https://app.lecturio.com/api/en/latest/html5/';
  protected _LOGIN_URL = 'https://app.lecturio.com/en/login';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LecturioBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    const loginForm = {
      'signin[email]': username,
      'signin[password]': password,
      'signin[remember]': 'on',
    };
    await this._request_webpage(
      { url: this._LOGIN_URL, data: urlencodePostdata(loginForm) },
      undefined,
      'Logging in',
    );
  }
}

const CC_LANGS: Record<string, string> = {
  Arabic: 'ar',
  Bulgarian: 'bg',
  German: 'de',
  English: 'en',
  Spanish: 'es',
  Persian: 'fa',
  French: 'fr',
  Japanese: 'ja',
  Polish: 'pl',
  Pashto: 'ps',
  Russian: 'ru',
};

export class LecturioIE extends LecturioBaseIE {
  static IE_NAME = 'lecturio';
  static _VALID_URL =
    /https?:\/\/(?:app\.lecturio\.com\/(?:[^/?#]+\/(?<nt>[^/?#&]+)\.lecture|(?:#\/)?lecture\/c\/\d+\/(?<id>\d+))|(?:www\.)?lecturio\.de\/(?:[^/?#]+\/)+(?<nt_de>[^/?#&]+)\.vortrag)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const nt = m.groups?.nt || m.groups?.nt_de;
    let lectureId = m.groups?.id;
    const displayId = nt || lectureId || url;
    const apiPath = lectureId ? `lectures/${lectureId}` : `lecture/${nt}.json`;

    const video = await this._download_json<Record<string, unknown>>(this._API_BASE_URL + apiPath, String(displayId));
    const title = String(video.title || '').trim();

    if (!lectureId) {
      const pid = video.productId || video.uid;
      if (pid) {
        const spid = String(pid).split('_');
        if (spid.length === 2) lectureId = spid[1];
      }
    }

    const formats: Format[] = [];
    const content = video.content as Record<string, unknown> | undefined;
    for (const format_ of (content?.media as unknown[]) || []) {
      if (!format_ || typeof format_ !== 'object') continue;
      const fmt = format_ as Record<string, unknown>;
      const file = fmt.file;
      if (!file) continue;
      const ext = determine_ext(String(file));
      if (ext === 'smil') continue;
      const fileUrl = url_or_none(file);
      if (!fileUrl) continue;
      const label = str_or_none(fmt.label);
      const f: Format = {
        url: fileUrl,
        format_id: label || `lecturio-${formats.length}`,
        filesize: int_or_none(fmt.fileSize, 1000) ?? undefined,
      };
      if (label) {
        const mobj = label.match(/(\d+)p\s*\(([^)]+)\)/);
        if (mobj) {
          f.format_id = mobj[2];
          f.height = int_or_none(mobj[1]) ?? undefined;
        }
      }
      formats.push(f);
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const automaticCaptions: Record<string, Subtitle[]> = {};
    for (const cc of (video.captions as Array<Record<string, unknown>>) || []) {
      const ccUrl = cc.url;
      if (!ccUrl) continue;
      const ccLabel = String(cc.translatedCode || '');
      let lang = String(cc.languageCode || '');
      if (!lang) {
        const lm = String(ccUrl).match(/\/([a-z]{2})_/);
        lang = lm?.[1] || ccLabel.split(' ')[0] || 'en';
      }
      const originalLang = String(ccUrl).match(/\/[a-z]{2}_([a-z]{2})_/)?.[1];
      const subDict = ccLabel.includes('auto-translated') || originalLang ? automaticCaptions : subtitles;
      const code = CC_LANGS[lang] || lang;
      if (!subDict[code]) subDict[code] = [];
      subDict[code]!.push({ url: String(ccUrl), ext: 'vtt' });
    }

    return {
      id: lectureId || nt || String(displayId),
      title,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      automatic_captions: Object.keys(automaticCaptions).length ? automaticCaptions : undefined,
    };
  }
}

export class LecturioCourseIE extends LecturioBaseIE {
  static IE_NAME = 'lecturio:course';
  static _VALID_URL =
    /https?:\/\/app\.lecturio\.com\/(?:[^/]+\/(?<nt>[^/?#&]+)\.course|(?:#\/)?course\/c\/(?<id>\d+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const nt = m.groups?.nt;
    const courseId = m.groups?.id;
    const displayId = nt || courseId || url;
    const apiPath = courseId ? `courses/${courseId}` : `course/content/${nt}.json`;
    const course = await this._download_json<Record<string, unknown>>(this._API_BASE_URL + apiPath, String(displayId));

    const entries: VideoInfo[] = [];
    for (const lecture of (course.lectures as Array<Record<string, unknown>>) || []) {
      const lectureId = str_or_none(lecture.id);
      let lectureUrl = str_or_none(lecture.url);
      if (lectureUrl) lectureUrl = urljoin(url, lectureUrl);
      else lectureUrl = `https://app.lecturio.com/#/lecture/c/${courseId}/${lectureId}`;
      entries.push(this.url_result(lectureUrl, 'Lecturio', lectureId ?? undefined));
    }

    return this.playlist_result(
      entries,
      String(displayId),
      String(course.title || displayId),
      clean_html(str_or_none(course.description)) || undefined,
    );
  }
}

export class LecturioDeCourseIE extends LecturioBaseIE {
  static IE_NAME = 'lecturio:de:course';
  static _VALID_URL = /https?:\/\/(?:www\.)?lecturio\.de\/[^/]+\/(?<id>[^/?#&]+)\.kurs/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(
      /<td[^>]+\bdata-lecture-id=["'](?<id>\d+)[\s\S]*?\bhref=(["'])(?<vurl>(?:(?!\2).)+\.vortrag)\b[^>]+>/gi,
    )) {
      entries.push(
        this.url_result(urljoin(url, m.groups?.vurl || ''), 'Lecturio', m.groups?.id),
      );
    }

    const title = this._search_regex(/<h1[^>]*>([^<]+)/, webpage, 'title', null, false) || displayId;
    return this.playlist_result(entries, displayId, title);
  }
}
