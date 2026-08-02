/**
 * AluraIE / AluraCourseIE — aligned with yt-dlp alura.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none } from '../../utils';

const LOGIN_URL = 'https://cursos.alura.com.br/loginForm?urlAfterLogin=/loginForm';
const VIDEO_URL = 'https://cursos.alura.com.br/course/%s/task/%s/video';

function urlJoin(base: string, path: string): string {
  try {
    return new URL(path, base).href;
  } catch {
    return path;
  }
}

function isLogged(webpage: string): boolean {
  return (
    /href=["']?\/signout["']?/i.test(webpage) ||
    />Logout</i.test(webpage)
  );
}

function hiddenInputs(html: string): Record<string, string> {
  const stripped = html.replace(/<!--(?:(?!<!--).)*-->/g, '');
  const out: Record<string, string> = {};
  for (const inputEl of stripped.match(/<input[^>]+>/gi) || []) {
    const typeMatch = /type\s*=\s*["']?(hidden|submit)["']?/i.exec(inputEl);
    if (!typeMatch) continue;
    const nameMatch = /(?:name|id)\s*=\s*["']([^"']+)["']/i.exec(inputEl);
    const valueMatch = /value\s*=\s*["']([^"']*)["']/i.exec(inputEl);
    if (nameMatch && valueMatch) out[nameMatch[1]!] = valueMatch[1]!;
  }
  return out;
}

abstract class AluraBaseIE extends InfoExtractor {
  static _NETRC_MACHINE = 'alura';

  protected async performLogin(username: string, password: string): Promise<void> {
    const loginPage = await this._download_webpage(LOGIN_URL, undefined, 'Downloading login popup');
    if (isLogged(loginPage)) return;

    const loginForm = hiddenInputs(loginPage);
    loginForm.username = username;
    loginForm.password = password;

    const postUrlRaw = this._search_regex(
      /<form[^>]+class=["']signin-form["'] action=["'](?<url>.+?)["']/,
      loginPage,
      'post url',
      LOGIN_URL,
      false,
      'url',
    );
    const postUrl = postUrlRaw?.startsWith('http')
      ? postUrlRaw
      : urlJoin(LOGIN_URL, postUrlRaw || '');

    const body = new URLSearchParams(loginForm).toString();
    const loggedIn = await this._request_webpage(
      { url: postUrl, data: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      undefined,
      'Logging in',
    );
    const responseText = loggedIn?.text || '';
    if (!isLogged(responseText)) {
      const error = this._html_search_regex(
        /<p[^>]+class="alert-message[^"]*">(.+?)<\/p>/s,
        responseText,
        'error message',
        null,
        false,
      );
      if (error) throw new ExtractorError(`Unable to login: ${error}`, { expected: true });
      throw new ExtractorError('Unable to log in', { expected: true });
    }
  }
}

export class AluraIE extends AluraBaseIE {
  static IE_NAME = 'alura';
  static _VALID_URL =
    /https?:\/\/(?:cursos\.)?alura\.com\.br\/course\/(?<course_name>[^/]+)\/task\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url);
    const course = match?.groups?.course_name || '';
    const videoId = match?.groups?.id || this._match_id(url);
    const videoApiUrl = VIDEO_URL.replace('%s', course).replace('%s', videoId);

    const videoDict = await this._download_json<Record<string, unknown>[]>(
      videoApiUrl,
      videoId,
      'Searching for videos',
      { fatal: false },
    );
    if (!videoDict?.length) {
      throw new ExtractorError('No Alura video found for this task', { expected: true });
    }

    const webpage = await this._download_webpage(url, videoId);
    const videoTitle = clean_html(
      this._search_regex(
        /<span[^>]+class=(["'])task-body-header-title-text\1[^>]*>(?<title>[^<]+)/,
        webpage,
        'title',
        videoId,
        true,
        'title',
      ),
    );

    const formats: Format[] = [];
    for (const videoObj of videoDict) {
      const m3u8Url = String((videoObj as Record<string, unknown>).mp4 || '');
      if (!m3u8Url) continue;
      const videoFormats = await this._extract_m3u8_formats(
        m3u8Url,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      for (const f of videoFormats) {
        const resMatch = /^[\w \W]*-(?<res>\w*)\.mp4[\W \w]*/.exec(f.url || '');
        if (resMatch && !f.height) {
          f.height = resMatch.groups?.res === 'hd' ? 720 : 480;
        }
      }
      formats.push(...videoFormats);
    }

    return {
      id: videoId,
      title: videoTitle || videoId,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'alura',
      extractor_key: 'Alura',
    };
  }
}

export class AluraCourseIE extends AluraBaseIE {
  static IE_NAME = 'aluracourse';
  static _NETRC_MACHINE = 'aluracourse';
  static _VALID_URL = /https?:\/\/(?:cursos\.)?alura\.com\.br\/course\/(?<id>[^/]+)/i;

  static suitable(url: string): boolean {
    if (AluraIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const coursePath = this._match_id(url);
    const webpage = await this._download_webpage(url, coursePath);

    const courseTitle =
      this._search_regex(
        /<h1.*?>(.*?)<strong>(?<course_title>.*?)<\/strong><\/h[0-9]>/s,
        webpage,
        'course title',
        coursePath,
        false,
        'course_title',
      ) || coursePath;

    const entries: VideoInfo[] = [];
    const sectionPaths = [
      ...webpage.matchAll(
        /<a\b(?=[^>]* class="[^"]*(?<=[" ])courseSectionList-section[" ])(?=[^>]* href="([^"]*))/g,
      ),
    ].map((m) => m[1]!);

    for (const path of sectionPaths) {
      const pageUrl = urlJoin(url, path);
      const sectionHtml = await this._download_webpage(pageUrl, coursePath);
      const chapter = clean_html(
        this._search_regex(
          /<h3[^>]+class=(["'])task-menu-section-title-text\1[^>]*>(?<chapter>[^<]+)/,
          sectionHtml,
          'chapter',
          null,
          false,
          'chapter',
        ),
      );
      const chapterNumber = int_or_none(
        this._search_regex(
          /<span[^>]+class=(["'])task-menu-section-title-number[^>]*>(.*?)<strong>(?<chapter_number>[^<]+)<\/strong>/s,
          sectionHtml,
          'chapter number',
          null,
          false,
          'chapter_number',
        ),
      );

      for (const videoPath of [
        ...sectionHtml.matchAll(
          /<a\b(?=[^>]* class="[^"]*(?<=[" ])task-menu-nav-item-link-VIDEO[" ])(?=[^>]* href="([^"]*))/g,
        ),
      ].map((m) => m[1]!)) {
        const videoUrl = urlJoin(url, videoPath);
        entries.push({
          _type: 'url_transparent',
          id: new URL(videoUrl).pathname.split('/').pop()?.replace(/\D/g, '') || videoUrl,
          url: videoUrl,
          ie_key: 'Alura',
          chapter: chapter || undefined,
          chapter_number: chapterNumber ?? undefined,
        });
      }
    }

    return this.playlist_result(entries, coursePath, courseTitle);
  }
}
