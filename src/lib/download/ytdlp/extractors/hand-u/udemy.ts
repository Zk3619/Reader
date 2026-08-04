// @ts-nocheck
/** UdemyIE / UdemyCourseIE â€?ported from yt-dlp udemy.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  float_or_none,
  int_or_none,
  js_to_json,
  smuggle_url,
  try_get,
  unescapeHTML,
  unsmuggle_url,
  url_or_none,
} from '../../utils';
import { hiddenInputs, urlencodePostdata, urljoin } from './_helpers';

export class UdemyIE extends InfoExtractor {
  static IE_NAME = 'udemy';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?udemy\.com\/(?:[^#]+#\/lecture\/|lecture\/view\/?\?lectureId=|[^/]+\/learn\/v4\/t\/lecture\/)(?<id>\d+)/;
  static _LOGIN_URL = 'https://www.udemy.com/join/login-popup/?displayType=ajax&showSkipButton=1';
  static _ORIGIN_URL = 'https://www.udemy.com';
  static _NETRC_MACHINE = 'udemy';

  protected _extractCourseInfo(webpage: string, videoId: string): [string, string | undefined] {
    const courseRaw = unescapeHTML(
      this._search_regex(/ng-init=["'].*\bcourse=(\{.+?\})[;"']/, webpage, 'course', '{}', false) || '{}',
    );
    const course = this._parse_json<Record<string, unknown>>(courseRaw, videoId, undefined, false) || {};
    const courseId =
      (course.id != null ? String(course.id) : null) ||
      this._search_regex(
        [/data-course-id=["'](\d+)/, /&quot;courseId&quot;\s*:\s*(\d+)/],
        webpage,
        'course id',
      )!;
    return [courseId, course.title as string | undefined];
  }

  protected async _enrollCourse(baseUrl: string, webpage: string, courseId: string): Promise<void> {
    const combineUrl = (u: string) => (u.startsWith('http') ? u : urljoin(baseUrl, u));

    const checkoutUrl = unescapeHTML(
      this._search_regex(
        /href=(["'])(?<url>(?:https?:\/\/(?:www\.)?udemy\.com)?\/(?:payment|cart)\/checkout\/.+?)\1/,
        webpage,
        'checkout url',
        null,
        false,
        'url',
      ) || '',
    );
    if (checkoutUrl) {
      throw new ExtractorError(
        `Course ${courseId} is not free. You have to pay for it before you can download. ` +
          `Use this URL to confirm purchase: ${combineUrl(checkoutUrl)}`,
        { expected: true },
      );
    }

    const enrollUrl = unescapeHTML(
      this._search_regex(
        /href=(["'])(?<url>(?:https?:\/\/(?:www\.)?udemy\.com)?\/course\/subscribe\/.+?)\1/,
        webpage,
        'enroll url',
        null,
        false,
        'url',
      ) || '',
    );
    if (enrollUrl) {
      const enrolled = await this._download_webpage(combineUrl(enrollUrl), courseId, 'Enrolling in the course', {
        headers: { Referer: baseUrl },
      });
      if (enrolled.includes('>You have enrolled in')) {
        this.to_screen(`${courseId}: Successfully enrolled in the course`);
      }
    }
  }

  protected async _downloadLecture(courseId: string, lectureId: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}?`,
      lectureId,
      'Downloading lecture JSON',
      {
        headers: this._udemyJsonHeaders(),
        query: {
          'fields[lecture]': 'title,description,view_html,asset',
          'fields[asset]':
            'asset_type,stream_url,thumbnail_url,download_urls,stream_urls,captions,data,course_is_drmed',
        },
      },
    );
  }

  protected _udemyJsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Udemy-Snail-Case': 'true',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const cookies = this._get_cookies('https://www.udemy.com');
    if (cookies.client_id) headers['X-Udemy-Client-Id'] = cookies.client_id;
    if (cookies.access_token) {
      headers['X-Udemy-Bearer-Token'] = cookies.access_token;
      headers['X-Udemy-Authorization'] = `Bearer ${cookies.access_token}`;
    }
    return headers;
  }

  protected _handleError(response: unknown): void {
    if (!response || typeof response !== 'object') return;
    const error = (response as Record<string, unknown>).error as Record<string, unknown> | undefined;
    if (!error) return;
    let errorStr = `Udemy returned error #${error.code}: ${error.message}`;
    const errorData = error.data as Record<string, unknown> | undefined;
    if (errorData) errorStr += ` - ${errorData.formErrors}`;
    throw new ExtractorError(errorStr, { expected: true });
  }

  protected async _performLogin(username: string, password: string): Promise<void> {
    const loginPopup = await this._download_webpage(UdemyIE._LOGIN_URL, undefined, 'Downloading login popup');
    const isLogged = (webpage: string) =>
      /href=["'](?:https:\/\/www\.udemy\.com)?\/user\/logout\//.test(webpage) || />Logout</.test(webpage);
    if (isLogged(loginPopup)) return;

    const loginForm = {
      ...hiddenInputs(loginPopup),
      email: username,
      password,
    };
    const response = await this._download_webpage(UdemyIE._LOGIN_URL, undefined, 'Logging in', {
      data: urlencodePostdata(loginForm),
      headers: {
        Referer: UdemyIE._ORIGIN_URL,
        Origin: UdemyIE._ORIGIN_URL,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });
    if (!isLogged(response)) {
      const error = this._html_search_regex(
        /<div[^>]+class="form-errors[^"]*">([\s\S]+?)<\/div>/,
        response,
        'error message',
        null,
        false,
      );
      if (error) throw new ExtractorError(`Unable to login: ${error}`, { expected: true });
      throw new ExtractorError('Unable to log in');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const lectureId = this._match_id(url);
    const courseIdFromSmuggle = unsmuggle_url(url, {})[1].course_id as string | undefined;

    let webpage: string | undefined;
    let courseId = courseIdFromSmuggle;
    if (!courseId) {
      webpage = await this._download_webpage(url, lectureId, undefined, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.109 Safari/537.36',
        },
      });
      if (
        webpage.includes('>Please verify you are a human') ||
        webpage.includes('Access to this page has been denied') ||
        webpage.includes('"_pxCaptcha"')
      ) {
        throw new ExtractorError(
          'Udemy asks you to solve a CAPTCHA. Login with browser, solve CAPTCHA, then export cookies.',
          { expected: true },
        );
      }
      [courseId] = this._extractCourseInfo(webpage, lectureId);
    }

    let lecture: Record<string, unknown>;
    try {
      lecture = await this._downloadLecture(courseId!, lectureId);
      this._handleError(lecture);
    } catch (e) {
      const msg = (e as Error)?.message || '';
      if (/403/.test(msg)) {
        webpage = webpage || (await this._download_webpage(url, lectureId));
        await this._enrollCourse(url, webpage, courseId!);
        lecture = await this._downloadLecture(courseId!, lectureId);
        this._handleError(lecture);
      } else {
        throw e;
      }
    }

    const title = String(lecture.title || lectureId);
    const description = lecture.description as string | undefined;
    const asset = lecture.asset as Record<string, unknown>;
    const assetType = (asset.asset_type || asset.assetType) as string | undefined;
    if (assetType !== 'Video') {
      throw new ExtractorError(`Lecture ${lectureId} is not a video`, { expected: true });
    }

    const streamUrl = (asset.stream_url || asset.streamUrl) as string | undefined;
    if (streamUrl) {
      const youtubeUrl = this._search_regex(
        /(https?:\/\/www\.youtube\.com\/watch\?v=.*)/,
        streamUrl,
        'youtube URL',
        null,
        false,
      );
      if (youtubeUrl) return this.url_result(youtubeUrl, 'Youtube');
    }

    const videoId = String(asset.id);
    const thumbnail = (asset.thumbnail_url || asset.thumbnailUrl) as string | undefined;
    let duration = float_or_none((asset.data as Record<string, unknown>)?.duration) ?? undefined;

    const subtitles: Record<string, Subtitle[]> = {};
    const automaticCaptions: Record<string, Subtitle[]> = {};
    const formats: Format[] = [];

    const extractOutputFormat = (src: Record<string, unknown>, fId: string): Format => ({
      url: src.url as string,
      format_id: `${src.height || fId}p`,
      width: int_or_none(src.width) ?? undefined,
      height: int_or_none(src.height) ?? undefined,
      vbr: int_or_none(src.video_bitrate_in_kbps) ?? undefined,
      vcodec: src.video_codec as string | undefined,
      fps: int_or_none(src.frame_rate) ?? undefined,
      abr: int_or_none(src.audio_bitrate_in_kbps) ?? undefined,
      acodec: src.audio_codec as string | undefined,
      asr: int_or_none(src.audio_sample_rate) ?? undefined,
      tbr: int_or_none(src.total_bitrate_in_kbps) ?? undefined,
      filesize: int_or_none(src.file_size_in_bytes) ?? undefined,
    });

    let outputs = (asset.data as Record<string, unknown>)?.outputs;
    if (!outputs || typeof outputs !== 'object') outputs = {};
    const outputsMap = outputs as Record<string, Record<string, unknown>>;

    const addOutputFormatMeta = (f: Format, key: string | undefined): Format => {
      if (!key) return f;
      const output = outputsMap[key];
      if (output && typeof output === 'object') {
        return { ...extractOutputFormat(output, key), ...f };
      }
      return f;
    };

    const extractFormats = async (sourceList: unknown): Promise<void> => {
      if (!Array.isArray(sourceList)) return;
      for (const source of sourceList as Array<Record<string, unknown>>) {
        const videoUrl = url_or_none(source.file || source.src);
        if (!videoUrl) continue;
        if (source.type === 'application/x-mpegURL' || determine_ext(videoUrl) === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              videoUrl,
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
          continue;
        }
        const formatId = source.label as string | undefined;
        let f: Format = {
          url: videoUrl,
          format_id: `${formatId}p`,
          height: int_or_none(formatId) ?? undefined,
        };
        if (formatId) f = addOutputFormatMeta(f, formatId);
        formats.push(f);
      }
    };

    const extractSubtitles = (trackList: unknown): void => {
      if (!Array.isArray(trackList)) return;
      for (const track of trackList as Array<Record<string, unknown>>) {
        if (!track || typeof track !== 'object') continue;
        if (track.kind !== 'captions') continue;
        const src = url_or_none(track.src);
        if (!src) continue;
        const lang = (track.language || track.srclang || track.label || 'en') as string;
        const subDict = track.autogenerated === true ? automaticCaptions : subtitles;
        (subDict[lang] ||= []).push({ url: src, ext: 'vtt' });
      }
    };

    for (const urlKind of ['download', 'stream'] as const) {
      const urls = asset[`${urlKind}_urls`];
      if (urls && typeof urls === 'object') {
        await extractFormats((urls as Record<string, unknown>).Video);
      }
    }

    const captions = asset.captions;
    if (Array.isArray(captions)) {
      for (const cc of captions as Array<Record<string, unknown>>) {
        if (!cc || typeof cc !== 'object') continue;
        const ccUrl = url_or_none(cc.url);
        if (!ccUrl) continue;
        const lang = (try_get(cc, (x) => (x.locale as Record<string, unknown>)?.locale) as string) || 'en';
        const subDict = cc.source === 'auto' ? automaticCaptions : subtitles;
        (subDict[lang] ||= []).push({ url: ccUrl, ext: 'vtt' });
      }
    }

    const viewHtml = lecture.view_html as string | undefined;
    if (viewHtml) {
      const viewHtmlUrls = new Set<string>();
      for (const source of viewHtml.matchAll(/<source[^>]+>/g)) {
        const attributes = extract_attributes(source[0]);
        const src = attributes.src;
        if (!src) continue;
        const res = attributes['data-res'];
        const height = int_or_none(res);
        if (viewHtmlUrls.has(src)) continue;
        viewHtmlUrls.add(src);
        if (attributes.type === 'application/x-mpegURL' || determine_ext(src) === 'm3u8') {
          const m3u8Formats = await this._extract_m3u8_formats(
            src,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          );
          for (const f of m3u8Formats) {
            const mm = f.url?.match(/\/hls_(?<height>\d{3,4})_(?<tbr>\d{2,})\//);
            if (mm?.groups) {
              if (!f.height) f.height = Number(mm.groups.height);
              if (!f.tbr) f.tbr = Number(mm.groups.tbr);
            }
          }
          formats.push(...m3u8Formats);
        } else {
          formats.push(
            addOutputFormatMeta(
              {
                url: src,
                format_id: height != null ? `${height}p` : 'http',
                height: height ?? undefined,
              },
              res,
            ),
          );
        }
      }

      const setupData = this._parse_json<Record<string, unknown>>(
        this._search_regex(
          /videojs-setup-data=(["'])(?<data>\{.+?\})\1/,
          viewHtml,
          'setup data',
          '{}',
          false,
          'data',
        ) || '{}',
        videoId,
        (s) => unescapeHTML(s),
        false,
      );
      if (setupData && typeof setupData === 'object') {
        await extractFormats(setupData.sources);
        if (duration == null) duration = int_or_none(setupData.duration) ?? undefined;
        extractSubtitles(setupData.tracks);
      }

      if (!Object.keys(subtitles).length && !Object.keys(automaticCaptions).length) {
        const textTracks = this._parse_json(
          this._search_regex(
            /text-tracks=(["'])(?<data>\[.+?\])\1/,
            viewHtml,
            'text tracks',
            '[]',
            false,
            'data',
          ) || '[]',
          videoId,
          (s) => js_to_json(unescapeHTML(s)),
          false,
        );
        extractSubtitles(textTracks);
      }
    }

    if (!formats.length && outputsMap) {
      for (const [formatId, output] of Object.entries(outputsMap)) {
        const f = extractOutputFormat(output, formatId);
        if (f.url) formats.push(f);
      }
    }

    if (!formats.length && asset.course_is_drmed) {
      this.report_drm(videoId);
    }

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      duration,
      formats,
      subtitles,
      automatic_captions: automaticCaptions,
    };
  }
}

export class UdemyCourseIE extends UdemyIE {
  static IE_NAME = 'udemy:course';
  static _VALID_URL = /https?:\/\/(?:[^/]+\.)?udemy\.com\/(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    if (UdemyIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const coursePath = this._match_id(url);
    const webpage = await this._download_webpage(url, coursePath);
    const [courseId, title] = this._extractCourseInfo(webpage, coursePath);
    await this._enrollCourse(url, webpage, courseId);

    const response = await this._download_json<{ results: Array<Record<string, unknown>> }>(
      `https://www.udemy.com/api-2.0/courses/${courseId}/cached-subscriber-curriculum-items`,
      courseId,
      'Downloading course curriculum',
      {
        headers: this._udemyJsonHeaders(),
        query: {
          'fields[chapter]': 'title,object_index',
          'fields[lecture]': 'title,asset',
          page_size: '1000',
        },
      },
    );

    const entries: VideoInfo[] = [];
    let chapter: string | undefined;
    let chapterNumber: number | undefined;
    for (const entry of response.results || []) {
      const clazz = entry._class;
      if (clazz === 'lecture') {
        const asset = entry.asset as Record<string, unknown> | undefined;
        if (asset && typeof asset === 'object') {
          const assetType = (asset.asset_type || asset.assetType) as string | undefined;
          if (assetType !== 'Video') continue;
        }
        const lectureId = entry.id;
        if (lectureId != null) {
          const item: VideoInfo = {
            _type: 'url_transparent',
            url: smuggle_url(`https://www.udemy.com/${coursePath}/learn/v4/t/lecture/${entry.id}`, {
              course_id: courseId,
            }),
            title: entry.title as string | undefined,
            ie_key: 'Udemy',
            id: String(lectureId),
          };
          if (chapterNumber != null) item.chapter_number = chapterNumber;
          if (chapter) item.chapter = chapter;
          entries.push(item);
        }
      } else if (clazz === 'chapter') {
        chapterNumber = entry.object_index as number | undefined;
        chapter = entry.title as string | undefined;
      }
    }

    return this.playlist_result(entries, courseId, title);
  }
}
