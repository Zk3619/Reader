/**
 * Dropout.tv — ported from yt-dlp dropout.py
 *
 * Pragmatic note: VHX embed extraction delegates to generated VHXEmbedIE via url_transparent.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  get_element_by_class,
  get_element_by_id,
  int_or_none,
  smuggle_url,
  unified_strdate,
} from '../../utils';
import { urlencodePostdata } from './_helpers';

const LOGIN_URL = 'https://watch.dropout.tv/login';

function getElementsHtmlByClass(cls: string, html: string): string[] {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*)>`,
    'gi',
  );
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    out.push(`<${m[1]}${m[2]}>`);
  }
  return out;
}

export class DropoutIE extends InfoExtractor {
  static IE_NAME = 'dropout';
  static _NETRC_MACHINE = 'dropout';
  static _VALID_URL =
    /https?:\/\/(?:watch\.)?dropout\.tv\/(?:[^/?#]+\/)*videos\/(?<id>[^/?#]+)\/?(?:[?#]|$)/;

  protected _getLoginInfo(): [string | null, string | null] {
    const username = this.params.username as string | undefined;
    const password = this.params.password as string | undefined;
    return [username || null, password || null];
  }

  protected async _getAuthenticityToken(displayId: string): Promise<string> {
    const signinPage = await this._download_webpage(LOGIN_URL, displayId, 'Getting authenticity token');
    const token = this._html_search_regex(
      /name=["']authenticity_token["'] value=["'](.+?)["']/,
      signinPage,
      'authenticity_token',
    );
    if (!token) throw new ExtractorError('Unable to extract authenticity_token', { expected: true });
    return token;
  }

  protected async _login(displayId: string): Promise<string | true | undefined> {
    const [username, password] = this._getLoginInfo();
    if (!username) return true;

    const response = await this._httpGetText(
      LOGIN_URL,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      {
        method: 'POST',
        body: urlencodePostdata({
          email: username,
          password: password || '',
          authenticity_token: await this._getAuthenticityToken(displayId),
          utf8: 'true',
        }),
      },
    ).catch(() => '');

    const userHasSubscription = this._search_regex(
      /user_has_subscription:\s*["'](.+?)["']/,
      response,
      'subscription status',
      'none',
      false,
    );
    if (userHasSubscription?.toLowerCase() === 'true') return;
    if (userHasSubscription?.toLowerCase() === 'false') return 'Account is not subscribed';
    return 'Incorrect username/password';
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);

    let webpage = await this._download_webpage(url, displayId, undefined, { fatal: false });
    if (!webpage || webpage.includes('<div id="watch-unauthorized"')) {
      const loginErr = await this._login(displayId);
      webpage = await this._download_webpage(url, displayId);
      if (loginErr && webpage.includes('<div id="watch-unauthorized"')) {
        if (loginErr === true) this.raise_login_required();
        throw new ExtractorError(String(loginErr), { expected: true });
      }
    }

    const embedUrl = this._html_search_regex(/embed_url:\s*["'](.+?)["']/, webpage, 'embed url');
    const thumbnail = this._og_search_thumbnail(webpage);
    const watchInfo = get_element_by_id('watch-info', webpage) || '';

    const title = clean_html(get_element_by_class('video-title', watchInfo)) || undefined;
    const seasonEpisode = get_element_by_class(
      'site-font-secondary-color',
      get_element_by_class('text', watchInfo) || '',
    );
    const episodeNumber = int_or_none(
      this._search_regex(/Episode (\d+)/, seasonEpisode || '', 'episode', null, false),
    );

    const embedId = this._search_regex(/embed\.vhx\.tv\/videos\/(.+?)\?/, embedUrl!, 'id');
    const seasonNumber = int_or_none(
      this._search_regex(/Season (\d+),/, seasonEpisode || '', 'season', null, false),
    );
    const releaseDate = unified_strdate(
      this._search_regex(
        /data-meta-field-name=["']release_dates["'] data-meta-field-value=["'](.+?)["']/,
        watchInfo,
        'release date',
        null,
        false,
      ),
    );

    return {
      _type: 'url_transparent',
      ie_key: 'VHXEmbed',
      url: smuggle_url(embedUrl!, { referer: 'https://watch.dropout.tv' }),
      id: embedId!,
      display_id: displayId,
      title,
      description: this._html_search_meta('description', webpage, undefined, false) || undefined,
      thumbnail: thumbnail?.split('?')[0],
      series: clean_html(get_element_by_class('series-title', watchInfo)) || undefined,
      episode_number: episodeNumber ?? undefined,
      episode: episodeNumber ? title : undefined,
      season_number: seasonNumber ?? undefined,
      release_date: releaseDate ?? undefined,
    };
  }
}

export class DropoutSeasonIE extends InfoExtractor {
  static IE_NAME = 'dropout:season';
  static _PAGE_SIZE = 24;
  static _VALID_URL =
    /https?:\/\/(?:watch\.)?dropout\.tv\/(?<id>[^/$&?#]+)(?:\/?$|\/season:(?<season>[0-9]+)\/?$)/;

  protected async *_fetchPage(
    pageUrl: string,
    seasonId: string,
    page: number,
  ): AsyncGenerator<VideoInfo> {
    const pageNum = page + 1;
    const webpage = await this._download_webpage(
      `${pageUrl}?page=${pageNum}`,
      seasonId,
      `Downloading page ${pageNum}`,
    );
    for (const el of getElementsHtmlByClass('browse-item-link', webpage)) {
      const href = extract_attributes(el).href;
      if (href) yield this.url_result(href, 'Dropout');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const seasonId = this._match_id(url);
    const seasonNum = this._match_valid_url(url)?.groups?.season || '1';
    const seasonTitle = seasonId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 100; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(url, seasonId, page)) {
        entries.push(entry);
        count++;
      }
      if (count < DropoutSeasonIE._PAGE_SIZE) break;
    }

    return this.playlist_result(
      entries,
      `${seasonId}-season-${seasonNum}`,
      `${seasonTitle} - Season ${seasonNum}`,
    );
  }
}
