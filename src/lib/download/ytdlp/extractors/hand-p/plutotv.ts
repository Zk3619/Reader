/** PlutoTVIE — ported from yt-dlp plutotv.py (ad-free m3u8 rewrite simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, int_or_none, url_or_none } from '../../utils';

export class PlutoTVIE extends InfoExtractor {
  static IE_NAME = 'plutotv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?pluto\.tv(?:\/[^/]+)?\/on-demand\/(?<video_type>movies|series)\/(?<series_or_movie_slug>[^/]+)(?:\/seasons?\/(?<season_no>\d+))?(?:\/episode\/(?<episode_slug>[^/]+))?\/?(?:$|[#?])/;

  static _INFO_URL = 'https://service-vod.clusters.pluto.tv/v3/vod/slugs/';
  static _INFO_QUERY_PARAMS = {
    appName: 'web',
    appVersion: 'na',
    clientID: crypto.randomUUID(),
    clientModelNumber: 'na',
    serverSideAds: 'false',
    deviceMake: 'unknown',
    deviceModel: 'web',
    deviceType: 'web',
    deviceVersion: 'unknown',
    sid: crypto.randomUUID(),
  };

  protected async _getVideoInfo(
    videoJson: Record<string, unknown>,
    slug: string,
    seriesName?: string,
  ): Promise<VideoInfo> {
    const videoId = String(videoJson._id ?? slug);
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const videoUrl of (videoJson.stitched as Record<string, unknown>)?.urls as Array<Record<string, unknown>> || []) {
      if (videoUrl.type !== 'hls') continue;
      const hlsUrl = url_or_none(videoUrl.url);
      if (!hlsUrl) continue;
      formats.push(
        ...(await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }

    const info: VideoInfo = {
      id: videoId,
      formats,
      subtitles,
      title: videoJson.name as string | undefined,
      description: videoJson.description as string | undefined,
      duration: float_or_none(videoJson.duration, 1000) ?? undefined,
    };
    if (seriesName) {
      info.series = seriesName;
      info.episode = videoJson.name as string | undefined;
      info.season_number = int_or_none(videoJson.season) ?? undefined;
      info.episode_number = int_or_none(videoJson.number) ?? undefined;
    }
    return info;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const infoSlug = m.groups?.series_or_movie_slug ?? '';
    const videoJson = await this._download_json<Record<string, unknown>>(
      PlutoTVIE._INFO_URL + infoSlug,
      infoSlug,
      undefined,
      { query: PlutoTVIE._INFO_QUERY_PARAMS },
    );

    if (m.groups?.video_type === 'series') {
      const seriesName = (videoJson.name as string) || infoSlug;
      const seasonNumber = m.groups?.season_no ? int_or_none(m.groups.season_no) : null;
      const episodeSlug = m.groups?.episode_slug;

      const videos: VideoInfo[] = [];
      for (const season of (videoJson.seasons as Array<Record<string, unknown>>) || []) {
        if (seasonNumber != null && seasonNumber !== int_or_none(season.number)) continue;
        for (const episode of (season.episodes as Array<Record<string, unknown>>) || []) {
          if (episodeSlug && episodeSlug !== episode.slug) continue;
          videos.push(await this._getVideoInfo(episode, String(episode.slug ?? ''), seriesName));
        }
      }
      if (!videos.length) throw new ExtractorError('Failed to find any videos to extract', { expected: true });
      if (episodeSlug && videos.length === 1) return videos[0]!;
      let playlistTitle = seriesName;
      if (seasonNumber != null) playlistTitle += ` - Season ${seasonNumber}`;
      return this.playlist_result(videos, String(videoJson._id ?? infoSlug), playlistTitle);
    }
    return this._getVideoInfo(videoJson, infoSlug);
  }
}
