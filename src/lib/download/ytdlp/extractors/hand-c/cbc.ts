/**
 * CBC family — ported from yt-dlp cbc.py
 *
 * Notes on pragmatic simplifications vs. upstream:
 * - `CBCGemIE`/`CBCGemBaseIE` account login (`_perform_login`, ROPC OAuth token refresh,
 *   claims-token caching) is not portable to this runtime and is omitted; extraction proceeds
 *   unauthenticated (matches public-video test cases).
 * - The "check for direct https mp4 format" HEAD-request upgrade in `CBCPlayerIE` is skipped;
 *   we keep the HLS formats as-is (mirrors the HDS-skip pattern used in hand-b/bbc.ts).
 * - No XML DOM/traverse_obj machinery is available; object fields are read with plain property
 *   access + null-coalescing, mirroring hand-b/bbc.ts style.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  js_to_json,
  mimetype2ext,
  str_or_none,
  unified_timestamp,
  update_url_query,
  url_or_none,
} from '../../utils';
import { orderedSet, parseIso8601, searchNextjsData, urljoin } from './_helpers';

function parseAgeLimitFromRating(rating: unknown): number | null {
  if (rating == null) return null;
  let s = String(rating).trim();
  if (s.toUpperCase().startsWith('C')) s = s.slice(1);
  const n = Number(s);
  if (Number.isFinite(n) && s !== '') return n;
  return null;
}

function dedupeFormatsByUrl(formats: Format[]): Format[] {
  const seen = new Set<string>();
  return formats.filter((f) => {
    if (!f.url) return true;
    if (seen.has(f.url)) return false;
    seen.add(f.url);
    return true;
  });
}

export class CBCIE extends InfoExtractor {
  static IE_NAME = 'cbc.ca';
  static _VALID_URL =
    /^https?:\/\/(?:www\.)?cbc\.ca\/(?!player\/|listen\/|i\/caffeine\/syndicate\/)(?:[^/?#]+\/)+(?<id>[^/?#]+)/;

  protected async _extractPlayerInit(playerInit: string, displayId: string): Promise<VideoInfo> {
    const playerInfo =
      this._parse_json<Record<string, unknown>>(playerInit, displayId, js_to_json, false) || {};
    let mediaId: string | null | undefined = str_or_none(playerInfo.mediaId);
    if (!mediaId) {
      const clipId = str_or_none(playerInfo.clipId) || '';
      const feed = await this._download_json<Record<string, unknown>>(
        `http://tpfeed.cbc.ca/f/ExhSPC/vms_5akSXx4Ng_Zn?byCustomValue={:mpsReleases}{${clipId}}`,
        clipId,
        undefined,
        { fatal: false },
      );
      const entries = feed?.entries as Record<string, unknown>[] | undefined;
      mediaId = str_or_none(entries?.[0]?.guid) || undefined;
      if (!mediaId) {
        const tp = await this._download_json<{ entries: Array<{ id: string }> }>(
          `http://feed.theplatform.com/f/h9dtGB/punlNGjMlc1F?fields=id&byContent=byReleases%3DbyId%253D${clipId}`,
          clipId,
        );
        const idPath = tp.entries[0]?.id || '';
        mediaId = idPath.split('/').pop() || clipId;
      }
    }
    return this.url_result(`cbcplayer:${mediaId}`, 'CBCPlayer', mediaId);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    let title =
      this._og_search_title(webpage) ||
      this._html_search_meta('twitter:title', webpage, 'title') ||
      this._search_regex(/<title[^>]*>([\s\S]*?)<\/title>/, webpage, 'title', null, false);
    if (title) {
      title =
        this._search_regex(
          /^(?<title>.+?)(?:\s*[|–-]\s*CBC.*)?$/,
          title,
          'cleaned title',
          title,
          false,
          'title',
        ) || title;
    }

    const data =
      this._search_json<Record<string, unknown>>(
        /window\.__INITIAL_STATE__\s*=/,
        webpage,
        'initial state',
        displayId,
        { default: {}, transform_source: js_to_json },
      ) || {};

    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/CBC\.APP\.Caffeine\.initInstance\((\{.+?\})\);/g)) {
      entries.push(await this._extractPlayerInit(m[1]!, displayId));
    }

    const mediaIds: string[] = [];
    for (const re of [
      /<iframe[^>]+src="[^"]+?mediaId=(\d+)"/g,
      /<div[^>]+\bid=["']player-(\d+)/g,
      /guid["']\s*:\s*["'](\d+)["']/g,
    ]) {
      for (const m of webpage.matchAll(re)) mediaIds.push(m[1]!);
    }

    const detail = data.detail as Record<string, unknown> | undefined;
    const content = (detail?.content as Record<string, unknown>)?.body;
    if (Array.isArray(content)) {
      for (const block of content) {
        const items = (block as Record<string, unknown>)?.content;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const rec = item as Record<string, unknown>;
          if (rec?.type !== 'polopoly_media') continue;
          const sourceId = str_or_none((rec.content as Record<string, unknown>)?.sourceId);
          if (sourceId) mediaIds.push(sourceId);
        }
      }
    }
    const contentId = str_or_none((data.app as Record<string, unknown>)?.contentId);
    if (contentId) mediaIds.push(contentId);

    for (const mediaId of orderedSet(mediaIds)) {
      entries.push(this.url_result(`cbcplayer:${mediaId}`, 'CBCPlayer', mediaId));
    }

    return this.playlist_result(
      entries,
      displayId,
      (title || '').trim() || undefined,
      this._og_search_description(webpage) || undefined,
    );
  }
}

export class CBCPlayerIE extends InfoExtractor {
  static IE_NAME = 'cbc.ca:player';
  static _VALID_URL =
    /^(?:cbcplayer:|https?:\/\/(?:www\.)?cbc\.ca\/(?:player\/play\/(?:video\/)?|i\/caffeine\/syndicate\/\?mediaId=))(?<id>(?:\d\.)?\d+)/;

  protected _parseParam(assetData: Record<string, unknown>, name: string): string | undefined {
    const params = assetData.params as Record<string, unknown>[] | undefined;
    for (const p of params || []) {
      if (p?.name === name) return str_or_none(p.value) ?? undefined;
    }
    return undefined;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://www.cbc.ca/player/play/${videoId}`, videoId);
    const state =
      this._search_json<Record<string, unknown>>(
        /window\.__INITIAL_STATE__\s*=/,
        webpage,
        'initial state',
        videoId,
        { transform_source: js_to_json },
      ) || {};
    const data = ((state.video as Record<string, unknown>)?.currentClip as Record<string, unknown>) || {};
    const media = (data.media as Record<string, unknown>) || {};
    const rawAssets = (media.assets as Record<string, unknown>[]) || [];
    const assets = rawAssets.filter((a) => url_or_none(a?.key) && a?.type);

    if (!assets.length) {
      const mediaId = str_or_none(data.mediaId);
      if (mediaId) {
        const tpUrl = `http://link.theplatform.com/s/ExhSPC/media/guid/2655402169/${mediaId}?mbr=true&formats=MPEG4,FLV,MP3`;
        const result = this.url_result(tpUrl, 'ThePlatform', mediaId);
        result._type = 'url_transparent';
        return result;
      }
    }

    const isLive = media.streamType === 'Live';
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const sub of (media.textTracks as Record<string, unknown>[]) || []) {
      const subUrl = url_or_none(sub?.src);
      if (!subUrl) continue;
      const lang = str_or_none(sub.language) || 'und';
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({ url: subUrl, ext: 'vtt', name: str_or_none(sub.label) ?? undefined });
    }

    for (const asset of assets) {
      const assetKey = String(asset.key);
      const assetType = String(asset.type);
      if (assetType !== 'medianet') {
        this.report_warning(`Skipping unsupported asset type "${assetType}": ${assetKey}`);
        continue;
      }
      const assetData = await this._download_json<Record<string, unknown>>(
        assetKey,
        videoId,
        `Downloading ${assetType} JSON`,
      );
      const contentType = this._parseParam(assetData, 'contentType');
      const ext = mimetype2ext(contentType);
      if (ext === 'm3u8') {
        const assetUrl = str_or_none(assetData.url) || '';
        const fmts = await this._extract_m3u8_formats(
          assetUrl,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
        formats.push(...fmts);
      } else {
        const mediaType = this._parseParam(assetData, 'mediaType');
        formats.push({
          format_id: 'direct',
          url: str_or_none(assetData.url) || '',
          ext: ext || undefined,
          vcodec: mediaType === 'audio' ? 'none' : undefined,
        });
      }
    }

    for (const fmt of formats) {
      if (fmt.vcodec === 'none') {
        if (!fmt.ext) fmt.ext = 'm4a';
        if (!fmt.acodec) fmt.acodec = 'mp4a.40.2';
        if ((fmt.format_id || '').toLowerCase().includes('descriptive')) fmt.preference = -2;
      }
    }

    const chaptersRaw = (media.chapters as Record<string, unknown>[]) || [];
    let chapters = chaptersRaw
      .filter((c) => Number.isFinite(Number(c?.startTime)))
      .map((c) => ({
        start_time: float_or_none(c.startTime, 1000) ?? undefined,
        end_time: float_or_none(c.endTime, 1000) ?? undefined,
        title: str_or_none(c.name) ?? undefined,
      }));
    if (chapters.length === 1 && !chapters[0]!.start_time && !chapters[0]!.end_time) chapters = [];

    return {
      id: videoId,
      title: str_or_none(data.title) ?? undefined,
      description: str_or_none(data.description) ?? undefined,
      thumbnail: url_or_none((data.image as Record<string, unknown>)?.url) ?? undefined,
      timestamp: float_or_none(data.publishedAt, 1000) ?? undefined,
      media_type: str_or_none(media.clipType) ?? undefined,
      series: str_or_none(data.showName) ?? undefined,
      season_number: int_or_none(media.season) ?? undefined,
      duration: isLive ? undefined : float_or_none(media.duration) ?? undefined,
      location: str_or_none(media.region) ?? undefined,
      tags: ((data.tags as Record<string, unknown>[]) || []).map((t) => str_or_none(t?.name) || '').filter(Boolean),
      genres: Array.isArray(media.genre) ? (media.genre as string[]) : undefined,
      categories: ((data.categories as Record<string, unknown>[]) || [])
        .map((c) => str_or_none(c?.name) || '')
        .filter(Boolean),
      formats: dedupeFormatsByUrl(formats),
      subtitles,
      chapters,
      is_live: isLive,
    };
  }
}

export class CBCPlayerPlaylistIE extends InfoExtractor {
  static IE_NAME = 'cbc.ca:player:playlist';
  static _VALID_URL = /^https?:\/\/(?:www\.)?cbc\.ca\/(?:player\/)(?!play\/)(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = decodeURIComponent(this._match_id(url)).toLowerCase();
    const webpage = await this._download_webpage(url, playlistId);
    const jsonContent =
      this._search_json<Record<string, unknown>>(
        /window\.__INITIAL_STATE__\s*=/,
        webpage,
        'initial state',
        playlistId,
      ) || {};

    const clipsByCategory =
      ((jsonContent.video as Record<string, unknown>)?.clipsByCategory as Record<string, unknown>) || {};
    const entries: VideoInfo[] = [];
    for (const [key, val] of Object.entries(clipsByCategory)) {
      if (key.toLowerCase() !== playlistId) continue;
      const items = (val as Record<string, unknown>)?.items as Record<string, unknown>[] | undefined;
      for (const item of items || []) {
        const videoId = str_or_none(item?.id);
        if (!videoId) continue;
        entries.push(this.url_result(`https://www.cbc.ca/player/play/${videoId}`, 'CBCPlayer'));
      }
    }

    return this.playlist_result(entries, playlistId);
  }
}

/** No standalone URL upstream; login/OAuth machinery omitted (see file header). */
export class CBCGemBaseIE extends InfoExtractor {
  static IE_NAME = 'cbcgembase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'cbcgem';

  protected async _callShowApi(itemId: string, displayId?: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `https://services.radio-canada.ca/ott/catalog/v2/gem/show/${itemId}`,
      displayId || itemId,
      undefined,
      { query: { device: 'web' } },
    );
  }

  protected async _callMediaApi(
    mediaId: string,
    appCode = 'gem',
    displayId?: string,
    headers?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const mediaData = await this._download_json<Record<string, unknown>>(
      'https://services.radio-canada.ca/media/validation/v2/',
      displayId || mediaId,
      undefined,
      {
        headers,
        query: {
          appCode,
          connectionType: 'hd',
          deviceType: 'ipad',
          multibitrate: 'true',
          output: 'json',
          tech: 'hls',
          manifestVersion: '2',
          manifestType: 'desktop',
          idMedia: mediaId,
        },
      },
    );

    const errorCode = int_or_none(mediaData.errorCode);
    if (errorCode === 1) this.raise_geo_restricted(undefined, ['CA']);
    if (errorCode === 35) this.raise_login_required();
    if (errorCode != null && errorCode !== 0) {
      throw new ExtractorError(
        `${this.IE_NAME} said: ${errorCode} - ${str_or_none(mediaData.message) || ''}`,
      );
    }
    return mediaData;
  }

  protected _extractItemInfo(itemInfo: Record<string, unknown>): Record<string, unknown> {
    let episodeNumber: number | null = int_or_none(itemInfo.episodeNumber);
    let title = str_or_none(itemInfo.title) || undefined;
    if (title) {
      const m = title.match(/^(?<episode>\d+)\. (?<title>.+)/);
      if (m?.groups) {
        episodeNumber = int_or_none(m.groups.episode);
        title = m.groups.title;
      }
    }
    const images = itemInfo.images as Record<string, unknown> | undefined;
    const metadata = (itemInfo.metadata as Record<string, unknown>) || {};
    return {
      id: str_or_none(itemInfo.url) ?? undefined,
      episode_id: str_or_none(itemInfo.url) ?? undefined,
      description: str_or_none(itemInfo.description) ?? undefined,
      thumbnail: url_or_none((images?.card as Record<string, unknown>)?.url) ?? undefined,
      episode_number: episodeNumber ?? undefined,
      duration: int_or_none(metadata.duration) ?? undefined,
      release_timestamp: unified_timestamp(metadata.airDate) ?? undefined,
      timestamp: unified_timestamp(metadata.availabilityDate) ?? undefined,
      age_limit: parseAgeLimitFromRating(metadata.rating) ?? undefined,
      episode: title,
      title,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CBCGemBaseIE has no standalone extraction', { expected: true });
  }
}

function findLineupItem(
  showInfo: Record<string, unknown>,
  predicate: (item: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  for (const c of (showInfo.content as Record<string, unknown>[]) || []) {
    for (const lineup of (c.lineups as Record<string, unknown>[]) || []) {
      for (const item of (lineup.items as Record<string, unknown>[]) || []) {
        if (predicate(item)) return item;
      }
    }
  }
  return null;
}

export class CBCGemIE extends CBCGemBaseIE {
  static IE_NAME = 'gem.cbc.ca';
  static _VALID_URL =
    /^https?:\/\/gem\.cbc\.ca\/(?:media\/)?(?<id>[0-9a-z-]+\/s(?<season>[0-9]+)[a-z][0-9]{2,4})\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url);
    const videoId = match!.groups!.id!;
    const seasonNumber = match!.groups!.season;
    const videoInfo = await this._callShowApi(videoId);
    const itemInfo = findLineupItem(videoInfo, (item) => item.url === videoId);
    if (!itemInfo) throw new ExtractorError('item info not found', { expected: true });

    const m3u8Url = str_or_none(
      (await this._callMediaApi(String(itemInfo.idMedia), 'gem', videoId)).url,
    );
    if (!m3u8Url) throw new ExtractorError('Unable to extract m3u8 url');
    const formats = dedupeFormatsByUrl(
      await this._extract_m3u8_formats(
        update_url_query(m3u8Url, { manifestType: '' }),
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
      ),
    );

    for (const fmt of formats) {
      if (fmt.vcodec === 'none') {
        if (!fmt.ext) fmt.ext = 'm4a';
        if (!fmt.acodec) fmt.acodec = 'mp4a.40.2';
        if ((fmt.format_id || '').toLowerCase().includes('descriptive')) fmt.preference = -2;
      }
    }

    const structuredMetadata = (videoInfo.structuredMetadata as Record<string, unknown>) || {};
    return {
      series: str_or_none(videoInfo.title) ?? undefined,
      genres: (structuredMetadata.genre as string[]) ?? undefined,
      ...this._extractItemInfo(itemInfo),
      season_number:
        int_or_none((structuredMetadata.partofSeason as Record<string, unknown>)?.seasonNumber) ??
        int_or_none(seasonNumber) ??
        undefined,
      id: videoId,
      episode_id: videoId,
      formats,
    } as VideoInfo;
  }
}

export class CBCGemPlaylistIE extends CBCGemBaseIE {
  static IE_NAME = 'gem.cbc.ca:playlist';
  static _VALID_URL =
    /^https?:\/\/gem\.cbc\.ca\/(?:media\/)?(?<id>(?<show>[0-9a-z-]+)\/s(?<season>[0-9]+))\/?(?:[?#]|$)/;

  protected _entries(seasonInfo: Record<string, unknown>): VideoInfo[] {
    const out: VideoInfo[] = [];
    for (const episode of (seasonInfo.items as Record<string, unknown>[]) || []) {
      const epUrl = str_or_none(episode.url);
      if (!epUrl) continue;
      out.push({
        ...this.url_result(`https://gem.cbc.ca/media/${epUrl}`, 'CBCGem'),
        ...this._extractItemInfo(episode),
      });
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url)!;
    const seasonId = match.groups!.id!;
    const show = match.groups!.show!;
    const season = match.groups!.season!;
    const showInfo = await this._callShowApi(show, seasonId);
    let seasonInfo: Record<string, unknown> | null = null;
    for (const c of (showInfo.content as Record<string, unknown>[]) || []) {
      for (const lineup of (c.lineups as Record<string, unknown>[]) || []) {
        if (int_or_none(lineup.seasonNumber) === int_or_none(season)) {
          seasonInfo = lineup;
          break;
        }
      }
      if (seasonInfo) break;
    }
    if (!seasonInfo) throw new ExtractorError('season info not found', { expected: true });

    const result = this.playlist_result(
      this._entries(seasonInfo),
      seasonId,
      str_or_none(seasonInfo.title) ?? undefined,
    );
    result.season = str_or_none(seasonInfo.title) ?? undefined;
    result.season_number = int_or_none(seasonInfo.seasonNumber) ?? undefined;
    result.series = str_or_none(showInfo.title) ?? undefined;
    return result;
  }
}

export class CBCGemContentIE extends CBCGemBaseIE {
  static IE_NAME = 'gem.cbc.ca:content';
  static _VALID_URL = /^https?:\/\/gem\.cbc\.ca\/(?<id>[0-9a-z-]+)\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nextData = searchNextjsData(this, webpage, displayId);
    const data = ((nextData.pageProps as Record<string, unknown>)?.data as Record<string, unknown>) || {};
    const contentType = str_or_none(data.contentType);

    if (contentType === 'Standalone') {
      const header = data.header as Record<string, unknown> | undefined;
      const cta = header?.cta as Record<string, unknown> | undefined;
      const mediaUrl = str_or_none((cta?.media as Record<string, unknown>)?.url);
      const newUrl = mediaUrl ? urljoin('https://gem.cbc.ca/', mediaUrl) : null;
      if (newUrl && CBCGemOlympicsIE.suitable(newUrl)) {
        return this.url_result(newUrl, 'CBCGemOlympics');
      }
      return this.url_result(`https://gem.cbc.ca/${displayId}/s01e01`, 'CBCGem');
    }

    const entries: VideoInfo[] = [];
    for (const c of (data.content as Record<string, unknown>[]) || []) {
      for (const lineup of (c.lineups as Record<string, unknown>[]) || []) {
        const lineupUrl = str_or_none(lineup.url);
        if (!lineupUrl) continue;
        const absolute = urljoin('https://gem.cbc.ca/', lineupUrl);
        if (!CBCGemPlaylistIE.suitable(absolute)) continue;
        entries.push(this.url_result(absolute, 'CBCGemPlaylist'));
      }
    }
    return this.playlist_result(entries, displayId);
  }
}

export class CBCGemOlympicsIE extends CBCGemBaseIE {
  static IE_NAME = 'gem.cbc.ca:olympics';
  static _VALID_URL =
    /^https?:\/\/gem\.cbc\.ca\/(?<id>(?:[0-9a-z]+-)+[0-9]{5,})\/s01e(?<media_id>[0-9]{5,})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const match = this._match_valid_url(url)!;
    const videoId = match.groups!.id!;
    const mediaId = match.groups!.media_id!;

    const videoInfo = await this._callShowApi(videoId);
    const itemInfo = findLineupItem(videoInfo, (item) => item.formattedIdMedia === mediaId);
    if (!itemInfo) throw new ExtractorError('item info not found', { expected: true });

    const liveStatusMap: Record<string, string> = { LiveEvent: 'is_live', Replay: 'was_live' };
    let liveStatus = liveStatusMap[String(itemInfo.type)] || undefined;

    const metadata = (itemInfo.metadata as Record<string, unknown>) || {};
    const releaseTimestamp =
      parseIso8601((metadata.live as Record<string, unknown>)?.startDate as string | undefined) ??
      parseIso8601((metadata.replay as Record<string, unknown>)?.airDate as string | undefined);

    let formats: Format[] = [];
    if (liveStatus === 'is_live' && releaseTimestamp && releaseTimestamp > Date.now() / 1000) {
      liveStatus = 'is_upcoming';
      this.raise_no_formats('This livestream has not yet started', true);
    } else {
      const m3u8Url = str_or_none((await this._callMediaApi(mediaId, 'medianetlive', videoId)).url);
      if (m3u8Url) {
        formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4');
      }
    }

    const images = itemInfo.images as Record<string, unknown> | undefined;
    return {
      id: videoId,
      formats,
      live_status: liveStatus,
      release_timestamp: releaseTimestamp ?? undefined,
      title: str_or_none(itemInfo.title) ?? undefined,
      description: str_or_none(itemInfo.description) ?? undefined,
      thumbnail: url_or_none((images?.card as Record<string, unknown>)?.url) ?? undefined,
      duration: int_or_none((metadata.replay as Record<string, unknown>)?.duration) ?? undefined,
    };
  }
}

export class CBCGemLiveIE extends CBCGemBaseIE {
  static IE_NAME = 'gem.cbc.ca:live';
  static _VALID_URL = /^https?:\/\/gem\.cbc\.ca\/live(?:-event)?\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nextData = searchNextjsData(this, webpage, videoId);
    let videoInfo = ((nextData.pageProps as Record<string, unknown>)?.data as Record<string, unknown>) || {};

    if (!videoInfo.formattedIdMedia) {
      const event = videoInfo.event as Record<string, unknown> | undefined;
      if (event && event.key === videoId) {
        videoInfo = event;
      } else {
        const freeTv = videoInfo.freeTv as Record<string, unknown> | undefined;
        const streams = (freeTv?.streams as Record<string, unknown>[]) || [];
        let found: Record<string, unknown> | undefined;
        for (const s of streams) {
          for (const item of (s.items as Record<string, unknown>[]) || []) {
            const key = String(item?.key || '');
            if (key.split('-')[0] === videoId) {
              found = item;
              break;
            }
          }
          if (found) break;
        }
        videoInfo = found || {};
      }
    }

    const videoStreamId = str_or_none(videoInfo.formattedIdMedia);
    if (!videoStreamId) {
      throw new ExtractorError("Couldn't find video metadata, maybe this livestream is now offline", {
        expected: true,
      });
    }

    let liveStatus = videoInfo.isVodEnabled ? 'was_live' : 'is_live';
    const releaseTimestamp = parseIso8601(videoInfo.airDate as string | undefined);

    let formats: Format[] = [];
    if (liveStatus === 'is_live' && releaseTimestamp && releaseTimestamp > Date.now() / 1000) {
      liveStatus = 'is_upcoming';
      this.raise_no_formats('This livestream has not yet started', true);
    } else {
      const m3u8Url = str_or_none((await this._callMediaApi(videoStreamId, 'medianetlive', videoId)).url);
      if (m3u8Url) formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4');
    }

    const images = videoInfo.images as Record<string, unknown> | undefined;
    return {
      id: videoId,
      formats,
      live_status: liveStatus,
      release_timestamp: releaseTimestamp ?? undefined,
      title: str_or_none(videoInfo.title) ?? undefined,
      description: str_or_none(videoInfo.description) ?? undefined,
      thumbnail: url_or_none((images?.card as Record<string, unknown>)?.url) ?? undefined,
    };
  }
}

export class CBCListenIE extends InfoExtractor {
  static IE_NAME = 'cbc.ca:listen';
  static _VALID_URL =
    /^https?:\/\/(?:www\.)?cbc\.ca\/listen\/(?:cbc-podcasts|live-radio)\/[\w-]+\/[\w-]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const response = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://www.cbc.ca/listen/api/v1/clips/${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    );
    let data: Record<string, unknown> | undefined = response?.data;
    if (!data) {
      this.report_warning('API failed to return data. Falling back to webpage parsing');
      const webpage = await this._download_webpage(url, videoId);
      const preloadedState =
        this._search_json<Record<string, unknown>>(
          /window\.__PRELOADED_STATE__\s*=/,
          webpage,
          'preloaded state',
          videoId,
          { transform_source: js_to_json },
        ) || {};
      const groups = ['podcastDetailData', 'showDetailData'];
      for (const g of groups) {
        const list = preloadedState[g];
        const items = Array.isArray(list) ? list : list ? [list] : [];
        for (const entry of items as Record<string, unknown>[]) {
          for (const episode of (entry?.episodes as Record<string, unknown>[]) || []) {
            if (String(episode?.clipID) === videoId) {
              data = episode;
              break;
            }
          }
          if (data) break;
        }
        if (data) break;
      }
      if (!data) throw new ExtractorError('episode data not found', { expected: true });
    }

    const directUrl = url_or_none((data.src as Record<string, unknown>)?.url) || url_or_none(data.url);
    const formats: Format[] = directUrl ? [this._create_format(directUrl, { ext: 'mp3' })] : [];

    return {
      id: videoId,
      title: str_or_none(data.title) ?? undefined,
      description: str_or_none(data.description) ?? undefined,
      release_timestamp: int_or_none(data.releasedAt, 1000) ?? undefined,
      timestamp: int_or_none(data.airdate, 1000) ?? undefined,
      duration: int_or_none(data.duration) ?? undefined,
      formats,
    };
  }
}
