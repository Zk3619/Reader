/**
 * AtresPlayerIE — aligned with yt-dlp atresplayer.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';

export class AtresPlayerIE extends InfoExtractor {
  static IE_NAME = 'atresplayer';
  static _NETRC_MACHINE = 'atresplayer';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?atresplayer\.com\/(?:[^/?#]+\/){4}(?<display_id>.+?)_(?<id>[0-9a-f]{24})/;

  private static API_BASE = 'https://api.atresplayer.com/';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.display_id ?? m[1] ?? '';
    const videoId = m.groups?.id ?? m[2] ?? '';

    const endpoint = await this._download_json<{ href?: string }>(
      `${AtresPlayerIE.API_BASE}client/v1/url`,
      videoId,
      'Downloading API endpoint data',
      { query: { href: new URL(url).pathname } },
    );
    const metadata = await this._download_json<Record<string, unknown>>(String(endpoint.href), videoId);
    const videoData = await this._download_json<Record<string, unknown>>(
      String(metadata.urlVideo),
      videoId,
      'Downloading video data',
    );

    const formats: Format[] = [];
    const subtitles: VideoInfo['subtitles'] = {};
    for (const source of (videoData.sources as Record<string, unknown>[]) || []) {
      const srcUrl = url_or_none(source.src);
      if (!srcUrl) continue;
      const srcType = source.type != null ? String(source.type) : '';
      if (
        srcType === 'application/vnd.apple.mpegurl' ||
        srcType === 'application/hls+legacy' ||
        srcType === 'application/hls+hevc'
      ) {
        formats.push(
          ...(await this._extract_m3u8_formats(srcUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (srcType === 'application/dash+xml' || srcType === 'application/dash+hevc') {
        formats.push(...(await this._extract_mpd_formats(srcUrl, videoId, 'dash', undefined, false)));
      }
    }

    const poster = url_or_none(videoData.imgPoster);
    return {
      display_id: displayId,
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(videoData.titulo || metadata.title) || videoId,
      description: str_or_none(videoData.descripcion || metadata.description) || null,
      duration: int_or_none(videoData.duration ?? metadata.duration) ?? undefined,
      thumbnail: poster ? `${poster}1920x1080.jpg` : undefined,
      tags: ((metadata.tags as Record<string, unknown>[]) || []).map((t) => String(t.title)),
      series: str_or_none(traverse_obj(metadata, ['format', 'title'])) || undefined,
      season: str_or_none(traverse_obj(metadata, ['currentSeason', 'title'])) || undefined,
      season_number: int_or_none(traverse_obj(metadata, ['currentSeason', 'seasonNumber'])) ?? undefined,
      episode_number: int_or_none(metadata.numberOfEpisode) ?? undefined,
      timestamp: int_or_none(metadata.publicationDate, 1000) ?? undefined,
      channel: str_or_none(traverse_obj(metadata, ['channel', 'title'])) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'atresplayer',
      extractor_key: 'AtresPlayer',
    };
  }
}
