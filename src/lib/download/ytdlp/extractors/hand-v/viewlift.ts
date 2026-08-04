// @ts-nocheck
/** ViewLiftBaseIE / ViewLiftEmbedIE / ViewLiftIE â€?ported from yt-dlp viewlift.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, traverse_obj } from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  mergeSubtitles,
  parse_age_limit,
} from './_helpers';

const DOMAINS_REGEX =
  String.raw`(?:(?:main\.)?snagfilms|snagxtreme|funnyforfree|kiddovid|winnersview|(?:monumental|lax)sportsnetwork|vayafilm|failarmy|ftfnext|lnppass\.legapallacanestro|moviespree|app\.myoutdoortv|neoufitness|pflmma|theidentitytb|chorki)\.com|(?:hoichoi|app\.horseandcountry|kronon|marquee|supercrosslive)\.tv`;

const SITE_MAP: Record<string, string> = {
  ftfnext: 'lax',
  funnyforfree: 'snagfilms',
  hoichoi: 'hoichoitv',
  kiddovid: 'snagfilms',
  laxsportsnetwork: 'lax',
  legapallacanestro: 'lnp',
  marquee: 'marquee-tv',
  monumentalsportsnetwork: 'monumental-network',
  moviespree: 'bingeflix',
  pflmma: 'pfl',
  snagxtreme: 'snagfilms',
  theidentitytb: 'tampabay',
  vayafilm: 'snagfilms',
  chorki: 'prothomalo',
};

export class ViewLiftBaseIE extends InfoExtractor {
  static IE_NAME = 'viewlift:base';
  static _VALID_URL = false as const;
  static _API_BASE = 'https://prod-api.viewlift.com/';
  static _DOMAINS_REGEX = DOMAINS_REGEX;
  static _SITE_MAP = SITE_MAP;
  static _TOKENS: Record<string, string> = {};

  protected _fetchToken(site: string, url: string): void {
    if (ViewLiftBaseIE._TOKENS[site]) return;
    const cookies = this._get_cookies(url);
    const tokenCookie = cookies.token;
    if (tokenCookie) {
      const m = /22authorizationToken%22:%22([^%]+)%22/.exec(tokenCookie);
      if (m?.[1]) ViewLiftBaseIE._TOKENS[site] = decodeURIComponent(m[1]);
    }
    if (!ViewLiftBaseIE._TOKENS[site]) {
      this.raise_login_required(
        'Cookies (not necessarily logged in) are needed to download from this website',
        undefined,
        'cookies',
      );
    }
  }

  protected async _callApi(
    site: string,
    path: string,
    videoId: string,
    url: string,
    query: Record<string, string>,
    apiBase = ViewLiftBaseIE._API_BASE,
  ): Promise<Record<string, unknown>> {
    this._fetchToken(site, url);
    try {
      return await this._download_json<Record<string, unknown>>(apiBase + path, videoId, undefined, {
        headers: { Authorization: ViewLiftBaseIE._TOKENS[site] || '' },
        query,
      });
    } catch (e) {
      if (e instanceof ExtractorError) {
        const msg = String(e.message || '');
        if (msg.includes('has not purchased')) this.raise_login_required(undefined, undefined, 'cookies');
      }
      throw e;
    }
  }
}

export class ViewLiftEmbedIE extends ViewLiftBaseIE {
  static IE_NAME = 'viewlift:embed';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:(?:www|embed)\.)?(?<domain>${DOMAINS_REGEX})/embed/player\?.*\bfilmId=(?<id>[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const filmId = m.groups!.id!;
    const parts = domain.replace(/^www\./, '').replace(/^embed\./, '').split('.');
    let site = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
    if (SITE_MAP[site]) site = SITE_MAP[site]!;

    const contentData = (
      await this._callApi(site, 'entitlement/video/status', filmId, url, { id: filmId })
    ).video as Record<string, unknown>;
    const gist = contentData.gist as Record<string, unknown>;
    const title = String(gist.title || filmId);
    const videoAssets = (contentData.streamingInfo as Record<string, unknown>)
      .videoAssets as Record<string, unknown>;

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    const hlsUrl = videoAssets.hls as string | undefined;
    if (hlsUrl) {
      const hls = await extractM3u8FormatsAndSubtitles(this, hlsUrl, filmId, 'hls');
      formats = hls.formats;
      subtitles = hls.subtitles;
    }

    for (const videoAsset of (videoAssets.mpeg as Array<Record<string, unknown>>) || []) {
      const videoAssetUrl = videoAsset.url as string | undefined;
      if (!videoAssetUrl) continue;
      const bitrate = int_or_none(videoAsset.bitrate);
      const height = int_or_none(
        this._search_regex(
          /^_?(\d+)[pP]$/,
          String(videoAsset.renditionValue || ''),
          'height',
          null,
          false,
        ),
      );
      formats.push({
        url: videoAssetUrl,
        format_id: join_nonempty('http', bitrate != null ? String(bitrate) : null),
        tbr: bitrate ?? undefined,
        height: height ?? undefined,
        vcodec: videoAsset.codec != null ? String(videoAsset.codec) : undefined,
      });
    }

    const subs: Record<string, Subtitle[]> = {};
    for (const sub of (traverse_obj(contentData, ['contentDetails', 'closedCaptions']) as
      | Array<Record<string, unknown>>
      | undefined) || []) {
      const subUrl = sub.url as string | undefined;
      if (!subUrl) continue;
      const lang = (sub.language as string) || 'English';
      (subs[lang] ||= []).push({ url: subUrl });
    }

    return {
      id: filmId,
      title,
      description: gist.description != null ? String(gist.description) : undefined,
      thumbnail: gist.videoImageUrl != null ? String(gist.videoImageUrl) : undefined,
      duration: int_or_none(gist.runtime) ?? undefined,
      age_limit: parse_age_limit(contentData.parentalRating as string) ?? undefined,
      timestamp: int_or_none(gist.publishDate, 1000) ?? undefined,
      formats,
      subtitles: mergeSubtitles(subs, subtitles),
      categories: ((contentData.categories as Array<Record<string, unknown>>) || [])
        .map((c) => (c.title != null ? String(c.title) : null))
        .filter(Boolean) as string[],
      tags: ((contentData.tags as Array<Record<string, unknown>>) || [])
        .map((t) => (t.title != null ? String(t.title) : null))
        .filter(Boolean) as string[],
    };
  }
}

export class ViewLiftIE extends ViewLiftBaseIE {
  static IE_NAME = 'viewlift';
  static _API_BASE = 'https://prod-api-cached-2.viewlift.com/';
  static _VALID_URL = new RegExp(
    String.raw`https?://(?:www\.)?(?<domain>${DOMAINS_REGEX})(?<path>(?:/(?:films/title|show|(?:news/)?videos?|watch))?/(?<id>[^?#]+))`,
  );

  static suitable(url: string): boolean {
    if (ViewLiftEmbedIE.suitable(url)) return false;
    return super.suitable(url);
  }

  protected *_showEntries(
    domain: string,
    seasons: Array<Record<string, unknown>>,
  ): Generator<VideoInfo> {
    for (const season of seasons) {
      for (const episode of (season.episodes as Array<Record<string, unknown>>) || []) {
        const path = traverse_obj(episode, ['gist', 'permalink']) as string | undefined;
        if (path) yield this.url_result(`https://www.${domain}${path}`, this.ie_key);
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const domain = m.groups!.domain!;
    const path = m.groups!.path!;
    const displayId = m.groups!.id!;

    const parts = domain.replace(/^www\./, '').split('.');
    let site = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
    if (SITE_MAP[site]) site = SITE_MAP[site]!;

    const modules = (
      await this._callApi(
        site,
        'content/pages',
        displayId,
        url,
        {
          includeContent: 'true',
          moduleOffset: '1',
          path,
          site,
        },
        ViewLiftIE._API_BASE,
      )
    ).modules as Array<Record<string, unknown>>;

    const seasons = modules.find((mod) => mod.moduleType === 'ShowDetailModule')
      ?.contentData as Array<Record<string, unknown>> | undefined;
    const seasonList = seasons?.[0]?.seasons as Array<Record<string, unknown>> | undefined;
    if (seasonList) {
      return this.playlist_result([...this._showEntries(domain, seasonList)], displayId);
    }

    const filmId = String(
      (
        (
          modules.find((mod) => mod.moduleType === 'VideoDetailModule')
            ?.contentData as Array<Record<string, unknown>>
        )?.[0]?.gist as Record<string, unknown>
      )?.id,
    );

    return {
      _type: 'url_transparent',
      url: `http://${domain}/embed/player?filmId=${filmId}`,
      id: filmId,
      display_id: displayId,
      title: displayId,
      ie_key: 'ViewLiftEmbed',
      extractor: 'ViewLiftEmbed',
      extractor_key: 'ViewLiftEmbed',
    };
  }
}
