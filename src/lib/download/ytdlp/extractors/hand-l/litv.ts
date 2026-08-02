/**
 * LiTVIE — ported from yt-dlp litv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, join_nonempty, smuggle_url, traverse_obj, unsmuggle_url } from '../../utils';
import { searchNextjsData, urljoin } from './_helpers';

export class LiTVIE extends InfoExtractor {
  static IE_NAME = 'litv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?litv\.tv\/(?:[^/?#]+\/watch\/|vod\/[^/?#]+\/content\.do\?content_id=)(?<id>[\w-]+)/;
  static _URL_TEMPLATE = 'https://www.litv.tv/%s/watch/%s';

  protected _yesPlaylist(playlistId: string | undefined, videoId: string): boolean {
    if (this.params.noplaylist) return false;
    return !!playlistId && playlistId !== videoId;
  }

  protected _extractPlaylist(playlistData: Record<string, unknown>, contentType: string): VideoInfo {
    const entries: VideoInfo[] = [];
    for (const season of (playlistData.seasons as Array<Record<string, unknown>>) || []) {
      for (const episode of (season.episodes as Array<Record<string, unknown>>) || []) {
        if (episode.content_id) {
          entries.push(
            this.url_result(
              smuggle_url(LiTVIE._URL_TEMPLATE.replace('%s', contentType).replace('%s', String(episode.content_id)), {
                force_noplaylist: true,
              }),
            ),
          );
        }
      }
    }
    return this.playlist_result(entries, String(playlistData.content_id ?? ''), String(playlistData.title ?? ''));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggled] = unsmuggle_url(url, {});
    const videoId = this._match_id(cleanUrl);
    const webpage = await this._download_webpage(cleanUrl, videoId);
    const vodData = searchNextjsData(this, webpage, videoId).pageProps as Record<string, unknown>;

    const programInfo = (vodData.programInformation as Record<string, unknown>) || {};
    const playlistData = vodData.seriesTree as Record<string, unknown> | undefined;
    if (playlistData && this._yesPlaylist(str_or_none(programInfo.series_id) ?? undefined, videoId) && !smuggled.force_noplaylist) {
      return this._extractPlaylist(playlistData, String(programInfo.content_type || 'drama'));
    }

    const assets = programInfo.assets as Array<Record<string, unknown>> | undefined;
    let assetId = str_or_none(assets?.[0]?.asset_id);
    let mediaType = 'vod';
    if (!assetId) {
      assetId = str_or_none(programInfo.content_id);
      mediaType = String(programInfo.content_type || 'vod');
    }

    const cookies = this._get_cookies('https://www.litv.tv/');
    const puid = cookies.PUID || crypto.randomUUID();
    const endpoint = cookies.PUID ? 'get-urls' : 'get-urls-no-auth';

    const videoData = await this._download_json<Record<string, unknown>>(
      `https://www.litv.tv/api/${endpoint}`,
      videoId,
      undefined,
      {
        method: 'POST',
        data: JSON.stringify({ AssetId: assetId, MediaType: mediaType, puid }),
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const error = traverse_obj(videoData, ['error']) as Record<string, unknown> | undefined;
    if (error) {
      const errorMsg = str_or_none(error.message);
      if (errorMsg?.includes('OutsideRegionError')) {
        this.raise_geo_restricted('This video is available in Taiwan only');
      }
      if (errorMsg) throw new ExtractorError(`${LiTVIE.IE_NAME} said: ${errorMsg}`, { expected: true });
      throw new ExtractorError(`Unexpected error from ${LiTVIE.IE_NAME}`);
    }

    const assetUrls = traverse_obj(videoData, ['result', 'AssetURLs']) as string[] | undefined;
    const formats = await this._extract_m3u8_formats(assetUrls?.[0] || '', videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    for (const fmt of formats) {
      fmt.http_headers = { ...(fmt.http_headers || {}), 'Accept-Encoding': 'identity' };
    }

    const genres = ((programInfo.genres as Array<Record<string, unknown>>) || [])
      .map((g) => str_or_none(g.name))
      .filter(Boolean) as string[];

    return {
      id: videoId,
      formats,
      title: join_nonempty(String(programInfo.title || ''), String(programInfo.secondary_mark || ''), '') || videoId,
      description: str_or_none(programInfo.description) ?? undefined,
      thumbnail: programInfo.picture
        ? urljoin('https://p-cdnstatic.svc.litv.tv/', String(programInfo.picture))
        : undefined,
      categories: genres.length ? genres : undefined,
      episode_number: int_or_none(programInfo.episode) ?? undefined,
    };
  }
}

function str_or_none(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
