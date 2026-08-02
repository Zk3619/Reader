/** TeamTreeHouseIE — ported from yt-dlp teamtreehouse.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, determine_ext, float_or_none, get_element_by_class, get_element_by_id, parse_duration, remove_end } from '../../utils';
import { hiddenInputs, parseHtml5MediaEntries, urlencodePostdata, urljoin } from './_helpers';

export class TeamTreeHouseIE extends InfoExtractor {
  static IE_NAME = 'teamtreehouse';
  static _NETRC_MACHINE = 'teamtreehouse';
  static _VALID_URL = /https?:\/\/(?:www\.)?teamtreehouse\.com\/library\/(?<id>[^/]+)/;

  protected async _performLogin(username: string, password: string): Promise<void> {
    const signinPage = await this._download_webpage('https://teamtreehouse.com/signin', undefined, 'Downloading signin page');
    const data = hiddenInputs(signinPage);
    data['user_session[email]'] = username;
    data['user_session[password]'] = password;
    const resp = await this._download_webpage('https://teamtreehouse.com/person_session', undefined, 'Logging in', {
      data: urlencodePostdata(data),
    });
    const err = get_element_by_class('error-message', resp);
    if (err) throw new ExtractorError(clean_html(err) || err, { expected: true });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const title = this._html_search_meta(['og:title', 'twitter:title'], webpage) ?? displayId;
    const description =
      this._html_search_meta(['description', 'og:description', 'twitter:description'], webpage) ?? undefined;

    const mediaEntries = await parseHtml5MediaEntries(this, url, webpage, displayId);
    if (mediaEntries.length) {
      const info = mediaEntries[0]!;
      for (const subs of Object.values(info.subtitles || {})) {
        for (const sub of subs) sub.ext = determine_ext(sub.url || '', 'srt');
      }
      const isPreview = webpage.includes('data-preview="true"');
      let duration: number | undefined;
      if (isPreview) {
        this.report_warning(
          'This is just a preview. You need to be signed in with a Basic account to download the entire video.',
        );
        duration = 30;
      } else {
        duration =
          float_or_none(this._search_regex(/data-duration="(\d+)"/, webpage, 'duration', null, false), 1000) ??
          parse_duration(get_element_by_id('video-duration', webpage) || '') ??
          undefined;
      }
      return {
        id: displayId,
        title,
        description,
        duration,
        formats: info.formats,
        subtitles: Object.keys(info.subtitles || {}).length ? info.subtitles : undefined,
      };
    }

    const entries: VideoInfo[] = [];
    const extractUrls = (html: string, extra: Partial<VideoInfo> = {}) => {
      for (const m of html.matchAll(/<a[^>]+href="([^"]+)"/g)) {
        const pageUrl = urljoin(url, m[1]!);
        if (!TeamTreeHouseIE._VALID_URL.test(pageUrl)) continue;
        entries.push({
          _type: 'url_transparent',
          id: pageUrl.match(TeamTreeHouseIE._VALID_URL)?.groups?.id || displayId,
          url: pageUrl,
          ie_key: 'TeamTreeHouse',
          ...extra,
        });
      }
    };

    const workshopVideos = this._search_regex(
      /<ul[^>]+id="workshop-videos"[^>]*>([\s\S]+?)<\/ul>/,
      webpage,
      'workshop videos',
      null,
      false,
    );
    if (workshopVideos) {
      extractUrls(workshopVideos);
    } else {
      const stagesPath = this._search_regex(/<div[^>]+id="syllabus-stages"[^>]+data-url="([^"]+)"/, webpage, 'stages path')!;
      const stagesPage = await this._download_webpage(urljoin(url, stagesPath), displayId, 'Downloading stages page');
      let chapterNumber = 0;
      for (const m of stagesPage.matchAll(/<h2[^>]*>\s*([\s\S]+?)\s*<\/h2>[\s\S]+?<ul[^>]*>([\s\S]+?)<\/ul>/g)) {
        chapterNumber += 1;
        extractUrls(m[2]!, { chapter: m[1]!.trim(), chapter_number: chapterNumber });
      }
    }

    return this.playlist_result(entries, displayId, remove_end(title, ' Course'), description);
  }
}
