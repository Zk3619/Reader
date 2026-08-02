/** SVTBaseIE / SVTPlayIE / SVTSeriesIE / SVTPageIE — ported from yt-dlp svt.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  dict_get,
  int_or_none,
  js_to_json,
  str_or_none,
  try_get,
  unified_timestamp,
  traverse_obj,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class SVTBaseIE extends InfoExtractor {
  static IE_NAME = 'svtbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _GEO_COUNTRIES = ['SE'];

  protected _fixupSubtitles(subtitles: Record<string, Subtitle[]>): Record<string, Subtitle[]> {
    const fixed: Record<string, Subtitle[]> = {};
    for (const [lang, subs] of Object.entries(subtitles)) {
      for (const sub of subs) {
        const fixedLang = sub.url?.includes('text-open') ? `${lang}-forced` : lang;
        (fixed[fixedLang] ||= []).push(sub);
      }
    }
    return fixed;
  }

  protected async _extractVideo(videoInfo: Record<string, unknown>, videoId: string): Promise<VideoInfo> {
    const isLive = dict_get(videoInfo, ['live', 'simulcast'], false) as boolean;
    const m3u8Protocol = isLive ? 'm3u8' : 'm3u8_native';
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const vr of (videoInfo.videoReferences as Record<string, unknown>[]) || []) {
      const playerType = (vr.playerType || vr.format) as string | undefined;
      const vurl = String(vr.url || '');
      const ext = determine_ext(vurl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, vurl, videoId, playerType || 'hls');
        formats.push(...res.formats.map((f) => ({ ...f, protocol: m3u8Protocol })));
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext === 'mpd') {
        const fmts = await this._extract_mpd_formats(vurl, videoId, playerType || 'dash', undefined, false);
        formats.push(...fmts);
      } else if (vurl) {
        formats.push({ format_id: playerType || 'http', url: vurl });
      }
    }

    const rights = (try_get(videoInfo, (x) => x.rights) as Record<string, unknown>) || {};
    if (!formats.length && rights.geoBlockedSweden) {
      this.raise_geo_restricted('This video is only available in Sweden', SVTBaseIE._GEO_COUNTRIES);
    }

    const subtitleRefs = dict_get(videoInfo, ['subtitles', 'subtitleReferences']) as Record<string, unknown>[] | undefined;
    if (Array.isArray(subtitleRefs)) {
      for (const sr of subtitleRefs) {
        const subtitleUrl = sr.url as string | undefined;
        if (!subtitleUrl) continue;
        const lang = (sr.language as string) || 'sv';
        const sub: Subtitle = { url: subtitleUrl, ext: determine_ext(subtitleUrl) || 'vtt' };
        if (determine_ext(subtitleUrl) === 'm3u8') sub.ext = 'vtt';
        (subtitles[lang] ||= []).push(sub);
      }
    }

    const adult = dict_get(videoInfo, ['inappropriateForChildren', 'blockedForChildren'], false);
    let ageLimit: number | undefined;
    if (adult != null) ageLimit = adult ? 18 : 0;

    return {
      id: videoId,
      title: (videoInfo.title as string) || undefined,
      formats,
      subtitles: this._fixupSubtitles(subtitles),
      duration: int_or_none(dict_get(videoInfo, ['materialLength', 'contentDuration'])) ?? undefined,
      timestamp: unified_timestamp(rights.validFrom) ?? undefined,
      age_limit: ageLimit,
      series: (videoInfo.programTitle as string) || undefined,
      season_number: int_or_none(videoInfo.season) ?? undefined,
      episode: (videoInfo.episodeTitle as string) || undefined,
      episode_number: int_or_none(videoInfo.episodeNumber) ?? undefined,
      is_live: isLive,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('SVTBaseIE is not a standalone extractor');
  }
}

export class SVTPlayIE extends SVTBaseIE {
  static IE_NAME = 'svt:play';
  static IE_DESC = 'SVT Play and Öppet arkiv';
  static _VALID_URL =
    /(?:svt:|https?:\/\/(?:www\.)?svt\.se\/barnkanalen\/barnplay\/[^/]+\/)(?<svt_id>[^/?#&]+)|https?:\/\/(?:www\.)?(?:svtplay|oppetarkiv)\.se\/(?:video|klipp|kanaler)\/(?<id>[^/?#&]+)(?:.*?(?:modalId|id)=(?<modal_id>[\da-zA-Z-]+))?/;

  protected async _extractByVideoId(videoId: string): Promise<VideoInfo> {
    const data = await this._download_json<Record<string, unknown>>(
      `https://api.svt.se/videoplayer-api/video/${videoId}`,
      videoId,
      undefined,
      { headers: this.geo_verification_headers() },
    );
    const info = await this._extractVideo(data, videoId);
    if (!info.title) info.title = String(info.episode || info.series || '');
    return info;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const pageId = m.groups!.id;
    let svtId: string | undefined = m.groups!.svt_id || m.groups!.modal_id;
    let webpage = '';
    if (!svtId) {
      webpage = await this._download_webpage(url, pageId || url);
      const data = this._search_json<Record<string, unknown>>(
        /(?<=[\s.])URQL_DATA\s*=/,
        webpage,
        'json data',
        pageId,
        { transform_source: js_to_json },
      );
      svtId =
        str_or_none(
          traverse_obj(Object.values(data || {}), [
            'data',
            (s: unknown) => {
              try {
                return JSON.parse(String(s));
              } catch {
                return null;
              }
            },
            'detailsPageByPath',
            'smartStart',
            'videoSvtId',
          ]) as string | undefined,
        ) || undefined;
      if (!svtId) throw new Error('Unable to extract SVT ID');
    }
    const info = await this._extractByVideoId(svtId!);
    if (!info.title && webpage) {
      const ogTitle = this._og_search_title(webpage) || '';
      info.title = ogTitle.replace(/\s*\|\s*.+?$/, '') || undefined;
    }
    if (!info.description && webpage) info.description = this._og_search_description(webpage) || undefined;
    if (webpage) info.thumbnail = this._og_search_thumbnail(webpage) || undefined;
    return info;
  }
}

export class SVTSeriesIE extends SVTBaseIE {
  static IE_NAME = 'svt:play:series';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?svtplay\.se\/(?<id>[^/?&#]+)(?:.+?\btab=(?<season_slug>[^&#]+))?/;

  static suitable(url: string): boolean {
    if (SVTPlayIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const seriesSlug = m.groups!.id!;
    const seasonId = m.groups!.season_slug;

    const series = (
      await this._download_json<{ data?: { listablesBySlug?: Record<string, unknown>[] } }>(
        'https://api.svt.se/contento/graphql',
        seriesSlug,
        'Downloading series page',
        {
          query: {
            query: `{ listablesBySlug(slugs: ["${seriesSlug}"]) { associatedContent { items { item { ... on Episode { videoSvtId } } } id name } id longDescription name shortDescription } }`,
          },
        },
      )
    ).data?.listablesBySlug?.[0] as Record<string, unknown>;

    let seasonName: string | undefined;
    const entries: VideoInfo[] = [];
    for (const season of (series.associatedContent as Record<string, unknown>[]) || []) {
      if (seasonId && season.id !== seasonId) continue;
      if (seasonId) seasonName = season.name as string | undefined;
      for (const item of (season.items as Record<string, unknown>[]) || []) {
        const video = (item.item as Record<string, unknown>) || {};
        const contentId = video.videoSvtId;
        if (typeof contentId !== 'string') continue;
        entries.push(this.url_result(`svt:${contentId}`, 'SVTPlay', contentId));
      }
    }

    let title = series.name as string | undefined;
    const sn = seasonName || seasonId;
    if (title && sn) title = `${title} - ${sn}`;
    else if (seasonId) title = seasonId;

    return this.playlist_result(
      entries,
      seasonId || (series.id as string),
      title,
      (series.longDescription || series.shortDescription) as string | undefined,
    );
  }
}

export class SVTPageIE extends SVTBaseIE {
  static IE_NAME = 'svt:page';
  static _VALID_URL = /https?:\/\/(?:www\.)?svt\.se\/(?:[^/?#]+\/)*(?<id>[^/?&#]+)/;

  static suitable(url: string): boolean {
    if (SVTPlayIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const title = this._og_search_title(webpage) || displayId;
    const urqlState = this._search_json<Record<string, unknown>>(/urqlState\s*[=:]/, webpage, 'json data', displayId) || {};

    const dataBlocks: Record<string, unknown>[] = [];
    for (const val of Object.values(urqlState)) {
      const block = val as Record<string, unknown>;
      if (typeof block.data === 'string') {
        try {
          dataBlocks.push(JSON.parse(block.data));
        } catch {
          /* ignore */
        }
      }
    }
    const data = dataBlocks[0] || {};

    const videoIds = new Set<string>();
    const top = traverse_obj(data, ['page', 'topMedia', 'svtId']) as string | undefined;
    if (top) videoIds.add(top);
    for (const body of (traverse_obj(data, ['page', 'body']) as Record<string, unknown>[]) || []) {
      const vid = traverse_obj(body, ['video', 'svtId']) as string | undefined;
      if (vid) videoIds.add(vid);
    }

    const entries: VideoInfo[] = [];
    for (const videoId of videoIds) {
      const info = await this._extractVideo(
        await this._download_json(`https://api.svt.se/video/${videoId}`, videoId),
        videoId,
      );
      info.title = title;
      entries.push(info);
    }
    return this.playlist_result(entries, displayId, title);
  }
}
