/**
 * DangalPlay family — ported from yt-dlp dangalplay.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, join_nonempty, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';
import { md5Hex } from '../hand-a/helpers';

const LOGIN_HINT =
  'Pass credentials as -u "token" -p "USER_ID" (where USER_ID is otv_user_id from browser local storage). ' +
  'Optional region suffix: -u "token@IN" -p "USER_ID"';

export class DangalPlayBaseIE extends InfoExtractor {
  static IE_NAME = 'dangalplaybase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'dangalplay';
  protected static _REGION = 'IN';
  protected static _OTV_USER_ID: string | null = null;
  protected static _API_BASE = 'https://ottapi.dangalplay.com';
  protected static _AUTH_TOKEN = 'jqeGWxRKK7FK5zEk3xCM';
  protected static _SECRET_KEY = 'f53d31a4377e4ef31fa0';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DangalPlayBaseIE is not a standalone extractor', { expected: true });
  }

  protected async performLogin(username: string, password: string): Promise<void> {
    if (DangalPlayBaseIE._OTV_USER_ID) return;
    const mobj = /^token(?:@(?<region>[A-Z]{2}))?$/.exec(username);
    if (!mobj || !/^[\da-f]{32}$/.test(password)) {
      throw new ExtractorError(LOGIN_HINT, { expected: true });
    }
    if (mobj.groups?.region) DangalPlayBaseIE._REGION = mobj.groups.region;
    DangalPlayBaseIE._OTV_USER_ID = password;
  }

  protected ensureLogin(): void {
    if (!DangalPlayBaseIE._OTV_USER_ID) {
      this.raise_login_required(`Login required. ${LOGIN_HINT}`, null, null);
    }
  }

  protected extractEpisodeInfo(
    metadata: Record<string, unknown>,
    episodeSlug: string,
    seriesSlug: string,
  ): Record<string, unknown> {
    return {
      display_id: episodeSlug,
      episode_number: int_or_none(
        this._search_regex(/ep-(?:number-)?(\d+)/, episodeSlug, 'episode number', null, false),
      ),
      season_number: int_or_none(
        this._search_regex(/season-(\d+)/, seriesSlug, 'season number', '1', false),
      ),
      series: seriesSlug,
      id: metadata.content_id != null ? String(metadata.content_id) : undefined,
      title: metadata.display_title != null ? String(metadata.display_title) : undefined,
      episode: metadata.title != null ? String(metadata.title) : undefined,
      series_id: metadata.catalog_id != null ? String(metadata.catalog_id) : undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
      release_timestamp: int_or_none(metadata.release_date_uts) ?? undefined,
    };
  }

  protected async callApi(
    path: string,
    displayId: string,
    note = 'Downloading JSON metadata',
    fatal = true,
    extraQuery: Record<string, string> = {},
  ): Promise<Record<string, unknown>> {
    return this._download_json(`${DangalPlayBaseIE._API_BASE}/${path}`, displayId, note, {
      fatal,
      headers: { Accept: 'application/json' },
      query: {
        auth_token: DangalPlayBaseIE._AUTH_TOKEN,
        region: DangalPlayBaseIE._REGION,
        ...extraQuery,
      },
    });
  }
}

export class DangalPlayIE extends DangalPlayBaseIE {
  static IE_NAME = 'dangalplay';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dangalplay\.com\/shows\/(?<series>[^/?#]+)\/(?<id>(?!episodes)[^/?#]+)\/?(?:$|[?#])/;

  private generateApiData(data: Record<string, unknown>): string {
    const catalogId = String(data.catalog_id ?? '');
    const contentId = String(data.content_id ?? '');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const unhashed = `${catalogId}${contentId}${DangalPlayBaseIE._OTV_USER_ID}${timestamp}${DangalPlayBaseIE._SECRET_KEY}`;
    return JSON.stringify({
      catalog_id: catalogId,
      content_id: contentId,
      category: '',
      region: DangalPlayBaseIE._REGION,
      auth_token: DangalPlayBaseIE._AUTH_TOKEN,
      id: DangalPlayBaseIE._OTV_USER_ID,
      md5: md5Hex(unhashed),
      ts: timestamp,
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    this.ensureLogin();
    const m = this._match_valid_url(url)!;
    const seriesSlug = m.groups!.series!;
    const episodeSlug = m.groups!.id!;
    const metadataResp = await this.callApi(
      `catalogs/shows/${seriesSlug}/episodes/${episodeSlug}.gzip`,
      episodeSlug,
      undefined,
      true,
      { item_language: '' },
    );
    const metadata = (metadataResp.data as Record<string, unknown>) || {};

    let details: Record<string, unknown>;
    try {
      const detailsResp = await this._download_json<{ data: Record<string, unknown> }>(
        `${DangalPlayBaseIE._API_BASE}/v2/users/get_all_details.gzip`,
        episodeSlug,
        'Downloading playback details JSON',
        {
          data: this.generateApiData(metadata),
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        },
      );
      details = detailsResp.data || {};
    } catch (e) {
      throw new ExtractorError(String((e as Error).message || e));
    }

    const adaptive = details.adaptive_url as string | undefined;
    const adaptiveUrls = details.adaptive_urls as Record<string, unknown> | undefined;
    const hdHls = adaptiveUrls?.hd as Record<string, unknown> | undefined;
    const hlsList = hdHls?.hls;
    let m3u8Url: string | null = null;
    if (adaptive) m3u8Url = url_or_none(adaptive);
    if (!m3u8Url && Array.isArray(hlsList)) {
      for (const item of hlsList) {
        if (item && typeof item === 'object') {
          m3u8Url = url_or_none((item as Record<string, unknown>).playback_url);
          if (m3u8Url) break;
        }
      }
    }

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      m3u8Url || '',
      episodeSlug,
      'hls',
    );

    return {
      formats,
      subtitles,
      ...this.extractEpisodeInfo(metadata, episodeSlug, seriesSlug),
    } as VideoInfo;
  }
}

export class DangalPlaySeasonIE extends DangalPlayBaseIE {
  static IE_NAME = 'dangalplay:season';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dangalplay\.com\/shows\/(?<id>[^/?#]+)(?:\/(?<sub>ep-[^/?#]+)\/episodes)?\/?(?:$|[?#])/;

  private async *entries(subcategories: string[], seriesSlug: string): AsyncGenerator<VideoInfo> {
    for (const subcategory of subcategories) {
      const data = await this.callApi(
        `catalogs/shows/items/${seriesSlug}/subcategories/${subcategory}/episodes.gzip`,
        seriesSlug,
        `Downloading episodes JSON for ${subcategory}`,
        false,
        { order_by: 'asc', status: 'published' },
      );
      const items = Array.isArray((data.data as Record<string, unknown>)?.items)
        ? ((data.data as Record<string, unknown>).items as Record<string, unknown>[])
        : [];
      for (const ep of items) {
        if (!ep?.friendly_id) continue;
        const episodeSlug = String(ep.friendly_id);
        yield this.url_result(
          `https://www.dangalplay.com/shows/${seriesSlug}/${episodeSlug}`,
          'DangalPlay',
          String(ep.content_id ?? episodeSlug),
          String(ep.display_title ?? episodeSlug),
        );
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    this.ensureLogin();
    const m = this._match_valid_url(url)!;
    const seriesSlug = m.groups!.id!;
    const subcategory = m.groups?.sub;
    let subcategories: string[];
    if (subcategory) {
      subcategories = [subcategory];
    } else {
      const seasonInfo = await this.callApi(`catalogs/shows/items/${seriesSlug}.gzip`, seriesSlug, undefined, true, {
        item_language: '',
      });
      const data = (seasonInfo.data as Record<string, unknown>) || {};
      const subs = Array.isArray(data.subcategories) ? data.subcategories : [];
      subcategories = subs
        .map((s) => (s && typeof s === 'object' ? String((s as Record<string, unknown>).friendly_id ?? '') : ''))
        .filter(Boolean);
    }

    const allEntries: VideoInfo[] = [];
    for await (const entry of this.entries(subcategories, seriesSlug)) {
      allEntries.push(entry);
    }
    return this.playlist_result(allEntries, join_nonempty(seriesSlug, subcategory, '-'));
  }
}
