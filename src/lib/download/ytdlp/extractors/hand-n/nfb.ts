/**
 * NFBBaseIE / NFBIE / NFBSeriesIE — ported from yt-dlp nfb.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, merge_dicts, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

const VALID_URL_BASE = /https?:\/\/(?:www\.)?(?<site>nfb|onf)\.ca/;

export class NFBBaseIE extends InfoExtractor {
  static IE_NAME = 'nfbbase';
  static _VALID_URL: RegExp | RegExp[] | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NFBBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractEpData(webpage: string, videoId: string, fatal = false): Record<string, unknown> {
    return (
      this._search_json<Record<string, unknown>>(/episodesData\s*:/, webpage, 'episode data', videoId, { fatal }) ||
      {}
    );
  }

  protected _extractEpInfo(data: unknown, videoId: string, slug?: string): Partial<VideoInfo> {
    const episodes = Array.isArray(data) ? data : [data];
    const info = episodes.find(
      (v) => typeof v === 'object' && v && String((v as Record<string, unknown>).embed_url || '').includes(videoId),
    ) as Record<string, unknown> | undefined;
    if (!info) return { id: videoId };

    const dataLayer = (info.data_layer as Record<string, unknown>) || {};
    return {
      id: videoId,
      title: [dataLayer.seriesTitle, dataLayer.episodeTitle].filter(Boolean).join(' - ') || undefined,
      description: info.description as string | undefined,
      thumbnail: url_or_none(info.thumbnail_url) ?? undefined,
      uploader: dataLayer.episodeMaker as string | undefined,
      release_year: int_or_none(dataLayer.episodeYear) ?? undefined,
      episode: dataLayer.episodeTitle as string | undefined,
      season: dataLayer.seasonTitle as string | undefined,
      season_number: int_or_none(String(dataLayer.seasonTitle || '').match(/\d+/)?.[0]) ?? undefined,
      series: dataLayer.seriesTitle as string | undefined,
      episode_number:
        int_or_none(
          (slug || videoId).match(/[/-]e(?:pisode)?-?(\d+)(?:[/-]|$)/i)?.[1],
        ) ?? undefined,
    };
  }
}

export class NFBIE extends NFBBaseIE {
  static IE_NAME = 'nfb';
  static _VALID_URL = [
    new RegExp(`${VALID_URL_BASE.source}/(?<type>film)/(?<id>[^/?#&]+)`),
    new RegExp(`${VALID_URL_BASE.source}/(?<type>series?)/(?<id>[^/?#&]+/s(?:ea|ai)son\\d+/episode\\d+)`),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups?.site ?? 'nfb';
    let type = m.groups?.type ?? 'film';
    let slug = m.groups?.id ?? '';

    const pageUrl = `https://www.${site}.ca/${type}/${slug}/`;
    const webpage = await this._download_webpage(pageUrl, slug);

    const playerData = this._search_json<Record<string, unknown>>(
      /window\.PLAYER_OPTIONS\[[^\]]+\]\s*=/,
      webpage,
      'player data',
      slug,
    )!;
    const overlayUrl = (playerData.overlay as Record<string, unknown>)?.url as string;
    const videoId = overlayUrl.split('/').filter(Boolean).pop() || slug;

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      String(playerData.source),
      videoId,
      'hls',
    );

    const dvSource = url_or_none(playerData.dvSource);
    if (dvSource) {
      const { formats: dvFmts, subtitles: dvSubs } = await extractM3u8FormatsAndSubtitles(this, dvSource, videoId, 'dv');
      for (const fmt of dvFmts) fmt.format_note = 'described video';
      formats.push(...dvFmts);
      mergeSubtitles(subtitles as Record<string, Subtitle[]>, dvSubs);
    }

    const info: Partial<VideoInfo> =
      type === 'film'
        ? {
            title:
              this._html_search_regex(/["']nfb_version_title["']\s*:\s*["']([^"']+)/, webpage, 'title', undefined, false) ||
              undefined,
            description:
              this._html_search_regex(/id=["']tabSynopsis["'][^>]*>\s*<p[^>]*>\s*([^<]+)/, webpage, 'description', undefined, false) ||
              undefined,
            thumbnail: url_or_none(playerData.poster) ?? undefined,
            uploader:
              this._html_search_regex(/itemprop=["']director["'][^>]*>([^<]+)/, webpage, 'uploader', undefined, false) ||
              undefined,
            release_year:
              int_or_none(
                this._html_search_regex(/["']nfb_version_year["']\s*:\s*["']([^"']+)/, webpage, 'release_year', undefined, false),
              ) ?? undefined,
          }
        : this._extractEpInfo(this._extractEpData(webpage, videoId), videoId, slug);

    const ld = this._search_json_ld(webpage, videoId, { fatal: false }) || {};
    return merge_dicts({ id: videoId, formats, subtitles }, info, ld) as VideoInfo;
  }
}

export class NFBSeriesIE extends NFBBaseIE {
  static IE_NAME = 'nfb:series';
  static _VALID_URL = new RegExp(`${VALID_URL_BASE.source}/(?<type>series?)/(?<id>[^/?#&]+)/?(?:[?#]|$)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups?.site ?? 'nfb';
    const type = m.groups?.type ?? 'series';
    const seriesId = m.groups?.id ?? '';
    const seasonPath = type === 'serie' ? 'saison' : 'season';
    const webpage = await this._download_webpage(
      `https://www.${site}.ca/${type}/${seriesId}/${seasonPath}1/episode1`,
      seriesId,
    );
    const episodes = this._extractEpData(webpage, seriesId, true);
    const epList = Array.isArray(episodes) ? episodes : Object.values(episodes);
    const entries: VideoInfo[] = [];
    for (const episode of epList) {
      const ep = episode as Record<string, unknown>;
      const embedUrl = String(ep.embed_url || '');
      const mobj = NFBIE._VALID_URL instanceof Array
        ? NFBIE._VALID_URL.map((r) => embedUrl.match(r)).find(Boolean)
        : embedUrl.match(NFBIE._VALID_URL as RegExp);
      if (!mobj) continue;
      const epId = mobj.groups?.id || seriesId;
      entries.push({
        ...this.url_result(mobj[0]!, 'NFB', epId),
        _type: 'url_transparent',
        ...this._extractEpInfo([ep], epId),
      } as VideoInfo);
    }
    return this.playlist_result(entries, seriesId);
  }
}
