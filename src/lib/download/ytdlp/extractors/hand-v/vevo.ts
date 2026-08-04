// @ts-nocheck
/** VevoBaseIE / VevoIE / VevoPlaylistIE â€?ported from yt-dlp vevo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_qs } from '../../utils';
import { extractMpdFormatsAndSubtitles, parse_iso8601 } from './_helpers';

export class VevoBaseIE extends InfoExtractor {
  static IE_NAME = 'vevo:base';
  static _VALID_URL = false as const;

  protected _extractJson(webpage: string, videoId: string): Record<string, unknown> {
    return this._parse_json<Record<string, unknown>>(
      this._search_regex(
        /window\.__INITIAL_STORE__\s*=\s*({.+?});\s*<\/script>/s,
        webpage,
        'initial store',
      )!,
      videoId,
    )!;
  }
}

export class VevoIE extends VevoBaseIE {
  static IE_NAME = 'vevo';
  static _VALID_URL =
    /(?:https?:\/\/(?:www\.)?vevo\.com\/watch\/(?!playlist|genre)(?:[^/]+\/(?:[^/]+\/)?)?|https?:\/\/cache\.vevo\.com\/m\/html\/embed\.html\?video=|https?:\/\/videoplayer\.vevo\.com\/embed\/embedded\?videoId=|https?:\/\/embed\.vevo\.com\/.*?[?&]isrc=|https?:\/\/tv\.vevo\.com\/watch\/artist\/(?:[^/]+)\/|vevo:)(?<id>[^&?#]+)/;

  static _VERSIONS: Record<number, string> = {
    0: 'youtube',
    1: 'level3',
    2: 'akamai',
    3: 'level3',
    4: 'amazon',
  };

  protected _apiUrlTemplate = '';

  protected async _initializeApi(videoId: string): Promise<void> {
    const webpage = await this._download_webpage(
      'https://accounts.vevo.com/token',
      undefined,
      'Retrieving oauth token',
      {
        data: JSON.stringify({
          client_id: 'SPupX1tvqFEopQ1YS6SS',
          grant_type: 'urn:vevo:params:oauth:grant-type:anonymous',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );

      if (/THIS PAGE IS CURRENTLY UNAVAILABLE IN YOUR REGION/i.test(webpage)) {
      this.raise_geo_restricted(`${VevoIE.IE_NAME} said: This page is currently unavailable in your region`);
    }

    const authInfo = this._parse_json<{ legacy_token: string }>(webpage, videoId)!;
    this._apiUrlTemplate = `https://apiv2.vevo.com/%s?token=${authInfo.legacy_token}`;
  }

  protected async _callApi<T = unknown>(
    path: string,
    videoId: string,
    note?: string,
    opts?: { fatal?: boolean },
  ): Promise<T> {
    try {
      return await this._download_json<T>(
        this._apiUrlTemplate.replace('%s', path),
        videoId,
        note,
        { fatal: opts?.fatal },
      );
    } catch (e) {
      if (e instanceof ExtractorError && opts?.fatal === false) return {} as T;
      throw e;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    await this._initializeApi(videoId);

    const videoInfo = await this._callApi<Record<string, unknown>>(
      `video/${videoId}`,
      videoId,
      'Downloading api video info',
    );

    let videoVersions =
      (await this._callApi<unknown>(
        `video/${videoId}/streams`,
        videoId,
        'Downloading video versions info',
        { fatal: false },
      )) || null;

    if (!videoVersions || (Array.isArray(videoVersions) && !videoVersions.length)) {
      const webpage = await this._download_webpage(url, videoId);
      const jsonData = this._extractJson(webpage, videoId);
      const def = (jsonData.default as Record<string, unknown>) || {};
      if (def.streams) {
        const streams = def.streams as Record<string, unknown[]>;
        videoVersions = streams[videoId]?.[0];
      } else {
        const apollo = ((jsonData.apollo as Record<string, unknown>)?.data || {}) as Record<
          string,
          unknown
        >;
        videoVersions = Object.entries(apollo)
          .filter(([key]) => key.startsWith(`${videoId}.streams`))
          .map(([, value]) => value);
      }
    }

    let uploader: string | undefined;
    let artist: string | undefined;
    let featuredArtist: string | undefined;
    for (const curr of (videoInfo.artists as Array<Record<string, unknown>>) || []) {
      if (curr.role === 'Featured') featuredArtist = String(curr.name);
      else artist = uploader = String(curr.name);
    }

    const formats: Format[] = [];
    const versions = Array.isArray(videoVersions) ? videoVersions : videoVersions ? [videoVersions] : [];
    for (const videoVersion of versions as Array<Record<string, unknown>>) {
      const version =
        VevoIE._VERSIONS[Number(videoVersion.version)] || 'generic';
      const versionUrl = videoVersion.url as string | undefined;
      if (!versionUrl) continue;
      if (versionUrl.includes('.ism')) continue;
      if (versionUrl.includes('.mpd')) {
        const { formats: dash } = await extractMpdFormatsAndSubtitles(
          this,
          versionUrl,
          videoId,
          `dash-${version}`,
        );
        formats.push(...dash);
      } else if (versionUrl.includes('.m3u8')) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            versionUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            `hls-${version}`,
            `Downloading ${version} m3u8 information`,
            false,
          )),
        );
      } else {
        const m =
          /_(?<quality>[a-z0-9]+)_(?<width>[0-9]+)x(?<height>[0-9]+)_(?<vcodec>[a-z0-9]+)_(?<vbr>[0-9]+)_(?<acodec>[a-z0-9]+)_(?<abr>[0-9]+)\.(?<ext>[a-z0-9]+)/i.exec(
            versionUrl,
          );
        if (!m?.groups) continue;
        formats.push({
          url: versionUrl,
          format_id: `http-${version}-${videoVersion.quality || m.groups.quality}`,
          vcodec: m.groups.vcodec,
          acodec: m.groups.acodec,
          vbr: Number(m.groups.vbr),
          abr: Number(m.groups.abr),
          ext: m.groups.ext,
          width: Number(m.groups.width),
          height: Number(m.groups.height),
        });
      }
    }

    const track = String(videoInfo.title || videoId);
    if (featuredArtist) artist = `${artist} ft. ${featuredArtist}`;
    const title = artist ? `${artist} - ${track}` : track;

    const genres = videoInfo.genres;
    const genre =
      Array.isArray(genres) && typeof genres[0] === 'string' ? (genres[0] as string) : undefined;

    const isExplicit = videoInfo.isExplicit;
    let ageLimit: number | undefined;
    if (isExplicit === true) ageLimit = 18;
    else if (isExplicit === false) ageLimit = 0;

    return {
      id: videoId,
      title,
      formats,
      thumbnail:
        (videoInfo.imageUrl as string) || (videoInfo.thumbnailUrl as string) || undefined,
      timestamp: parse_iso8601(videoInfo.releaseDate) ?? undefined,
      uploader,
      duration: int_or_none(videoInfo.duration) ?? undefined,
      view_count: int_or_none(
        (videoInfo.views as Record<string, unknown> | undefined)?.total,
      ) ?? undefined,
      age_limit: ageLimit,
      track,
      artist: uploader,
      genre,
    };
  }
}

export class VevoPlaylistIE extends VevoBaseIE {
  static IE_NAME = 'vevo:playlist';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vevo\.com\/watch\/(?<kind>playlist|genre)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const playlistId = mobj.groups!.id!;
    const playlistKind = mobj.groups!.kind!;

    const webpage = await this._download_webpage(url, playlistId);
    const qs = parse_qs(url);
    const index = qs.index?.[0];

    if (index) {
      const videoId = this._search_regex(
        /<meta[^>]+content=(["'])vevo:\/\/video\/(?<id>.+?)\1[^>]*>/,
        webpage,
        'video id',
        null,
        false,
        'id',
      );
      if (videoId) return this.url_result(`vevo:${videoId}`, 'vevo');
    }

    const playlists = (this._extractJson(webpage, playlistId).default as Record<string, unknown>)?.[
      `${playlistKind}s`
    ] as Record<string, Record<string, unknown>>;

    const playlist =
      playlistKind === 'playlist'
        ? Object.values(playlists)[0]!
        : playlists[playlistId]!;

    const entries = ((playlist.isrcs as string[]) || []).map((src) =>
      this.url_result(`vevo:${src}`, 'vevo'),
    );

    return this.playlist_result(
      entries,
      (playlist.playlistId as string) || playlistId,
      playlist.name as string | undefined,
      playlist.description as string | undefined,
    );
  }
}
