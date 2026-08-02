/** Teachable family ?ported from yt-dlp teachable.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, get_element_by_class, int_or_none } from '../../utils';
import { hiddenInputs, strip_or_none, urlencodePostdata, urljoin } from './_helpers';

type LoginInfoGetter = { _get_login_info?: () => [string?, string?] | undefined };

const SITES: Record<string, string> = {
  'v1.upskillcourses.com': 'upskill',
  'gns3.teachable.com': 'gns3',
  'academyhacker.com': 'academyhacker',
  'stackskills.com': 'stackskills',
  'market.saleshacker.com': 'saleshacker',
  'learnability.org': 'learnability',
  'edurila.com': 'edurila',
  'courses.workitdaily.com': 'workitdaily',
};

const SITE_ALT = Object.keys(SITES).map((s) => s.replace(/\./g, '\\.')).join('|');
const URL_PREFIX = 'teachable:';

function isLogged(webpage: string): boolean {
  return [/class=["']user-signout/, /<a[^>]+\bhref=["']\/sign_out/, /Log\s+[Oo]ut\s*</].some((re) => re.test(webpage));
}

function extractWistiaUrls(webpage: string): string[] {
  const urls = new Set<string>();
  for (const m of webpage.matchAll(/(?:https?:)?\/\/(?:fast\.)?wistia\.(?:net|com)\/(?:embed\/|medias\/)([a-z0-9]{10})/gi)) {
    urls.add(`wistia:${m[1]}`);
  }
  for (const m of webpage.matchAll(/Wistia\.embed\([^)]*["']([a-z0-9]{10})["']/gi)) {
    urls.add(`wistia:${m[1]}`);
  }
  return [...urls];
}

export class TeachableBaseIE extends InfoExtractor {
  static IE_NAME = 'teachablebase';
  static _NETRC_MACHINE = 'teachable';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  protected _loggedIn = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TeachableBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _login(site: string): Promise<void> {
    if (this._loggedIn) return;
    const [username, password] = (this as LoginInfoGetter)._get_login_info?.() || [undefined, undefined];
    if (!username) return;

    const loginPage = await this._download_webpage(`https://${site}/sign_in`, site, `Downloading ${site} login page`);
    if (isLogged(loginPage)) {
      this._loggedIn = true;
      return;
    }

    const loginForm = hiddenInputs(loginPage);
    loginForm['user[email]'] = username;
    loginForm['user[password]'] = password!;
    const postUrlMatch = loginPage.match(/<form[^>]+action=(["'])(?<url>(?:(?!\1).)+)\1/);
    const postUrl = postUrlMatch?.groups?.url?.startsWith('http')
      ? postUrlMatch.groups.url
      : urljoin(`https://${site}/sign_in`, postUrlMatch?.groups?.url || '');

    const response = await this._download_webpage(postUrl, site, `Logging in to ${site}`, {
      data: urlencodePostdata(loginForm),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `https://${site}/sign_in` },
    });

    if (response.includes('>I accept the new Privacy Policy<')) {
      throw new ExtractorError(
        `Unable to login: ${site} asks you to accept new Privacy Policy. Go to https://${site}/ and accept.`,
        { expected: true },
      );
    }
    if (isLogged(response)) {
      this._loggedIn = true;
      return;
    }
    const message = get_element_by_class('alert', response);
    if (message) throw new ExtractorError(`Unable to login: ${clean_html(message)}`, { expected: true });
    throw new ExtractorError('Unable to log in', { expected: true });
  }
}

export class TeachableIE extends TeachableBaseIE {
  static IE_NAME = 'teachable';
  static _VALID_URL = new RegExp(
    String.raw`(?:` +
      `${URL_PREFIX.replace(':', '\\:')}https?://(?<site_t>[a-zA-Z0-9.-]+)|` +
      String.raw`https?://(?:www\.)?(?<site>${SITE_ALT})` +
      String.raw`)` +
      String.raw`/courses/[^/]+/lectures/(?<id>\d+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site || m.groups!.site_t!;
    const videoId = m.groups!.id!;
    await this._login(site);

    let fetchUrl = url.startsWith(URL_PREFIX) ? url.slice(URL_PREFIX.length) : url;
    const webpage = await this._download_webpage(fetchUrl, videoId);
    const wistiaUrls = extractWistiaUrls(webpage);
    if (!wistiaUrls.length) {
      if (
        [/class=["']lecture-contents-locked/, />\s*Lecture contents locked/, /id=["']lecture-locked/, /lesson-locked/, />LESSON LOCKED</].some(
          (re) => re.test(webpage),
        )
      ) {
        this.raise_login_required('Lecture contents locked');
      }
      throw new ExtractorError('Unable to find video URL', { expected: true });
    }

    let title = this._og_search_title(webpage, false);
    let chapter: string | undefined;
    let chapterNumber: number | undefined;
    const sectionItem = this._search_regex(
      new RegExp(String.raw`(?<li><li[^>]+\bdata-lecture-id=["']${videoId}[^>]+>[\s\S]+?</li>)`),
      webpage,
      'section item',
      null,
      false,
      'li',
    );
    if (sectionItem) {
      chapterNumber =
        int_or_none(this._search_regex(/data-ss-position=["'](\d+)/, sectionItem, 'section id', null, false)) ?? undefined;
      if (chapterNumber != null) {
        const sections: string[] = [];
        for (const s of webpage.matchAll(/<div[^>]+\bclass=["']section-title[^>]+>([\s\S]+?)<\/div>/g)) {
          const section = strip_or_none(clean_html(s[1]!));
          if (!section) {
            sections.length = 0;
            break;
          }
          sections.push(section);
        }
        if (chapterNumber <= sections.length) chapter = sections[chapterNumber - 1];
      }
    }

    return this.playlist_result(
      wistiaUrls.map((wistiaUrl) => ({
        _type: 'url_transparent' as const,
        id: wistiaUrl.replace('wistia:', ''),
        url: wistiaUrl,
        ie_key: 'Wistia',
        title: title || undefined,
        chapter,
        chapter_number: chapterNumber,
      })),
      videoId,
      title || undefined,
    );
  }
}

export class TeachableCourseIE extends TeachableBaseIE {
  static IE_NAME = 'teachable:course';
  static _VALID_URL = new RegExp(
    String.raw`(?:` +
      `${URL_PREFIX.replace(':', '\\:')}https?://(?<site_t>[a-zA-Z0-9.-]+)|` +
      String.raw`https?://(?:www\.)?(?<site>${SITE_ALT})` +
      String.raw`)` +
      String.raw`/(?:courses|p)/(?:enrolled/)?(?<id>[^/?#&]+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site || m.groups!.site_t!;
    const courseId = m.groups!.id!;
    await this._login(site);

    const prefixed = url.startsWith(URL_PREFIX);
    let fetchUrl = prefixed ? url.slice(URL_PREFIX.length) : url;
    const webpage = await this._download_webpage(fetchUrl, courseId);
    const urlBase = `https://${site}/`;
    const entries: VideoInfo[] = [];

    for (const liMatch of webpage.matchAll(
      /(?<li><li[^>]+class=(["'])(?:(?!\2).)*?section-item[^>]+>[\s\S]+?<\/li>)/g,
    )) {
      const li = liMatch.groups!.li!;
      if (!li.includes('fa-youtube-play') && !/\d{1,2}:\d{2}/.test(li)) continue;
      const lectureUrl = this._search_regex(/<a[^>]+href=(["'])(?<url>(?:(?!\1).)+)\1/, li, 'lecture url', null, false, 'url');
      if (!lectureUrl) continue;
      const lectureId = this._search_regex(/\/lectures\/(\d+)/, lectureUrl, 'lecture id', null, false);
      const entryTitle = this._html_search_regex(/<span[^>]+class=["']lecture-name[^>]+>([^<]+)/, li, 'title', null, false);
      let entryUrl = urljoin(urlBase, lectureUrl);
      if (prefixed) entryUrl = URL_PREFIX + entryUrl;
      entries.push(this.url_result(entryUrl, 'Teachable', lectureId || undefined, clean_html(entryTitle || '')));
    }

    const courseTitle = this._html_search_regex(
      [/<img[^>]+class=["']course-image[^>]+>\s*<h\d>([\s\S]+?)<\/h/, /<h\d[^>]+class=["']course-title[^>]+>([\s\S]+?)<\/h/],
      webpage,
      'course title',
      null,
      false,
    );

    return this.playlist_result(entries, courseId, courseTitle || undefined);
  }
}
