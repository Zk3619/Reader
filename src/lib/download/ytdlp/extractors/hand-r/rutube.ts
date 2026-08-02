/** Rutube* — ported from yt-dlp rutube.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  bool_or_none,
  determine_ext,
  int_or_none,
  try_get,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class RutubeBaseIE extends InfoExtractor {
  static IE_NAME = 'RutubeBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RutubeBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _downloadApiInfo(videoId: string, query: Record<string, string> = {}) {
    return this._download_json<Record<string, unknown>>(
      `https://rutube.ru/api/video/${videoId}/`,
      videoId,
      'Downloading video JSON',
      { query: { format: 'json', ...query } },
    );
  }

  protected _extractInfo(video: Record<string, unknown>, videoId?: string, requireTitle = true): VideoInfo {
    const title = requireTitle ? (video.title as string) : (video.title as string | undefined);
    let ageLimit = video.is_adult as boolean | undefined;
    if (ageLimit != null) ageLimit = ageLimit ? (18 as unknown as boolean) : (0 as unknown as boolean);
    const uploaderId = try_get(video, (x) => (x.author as Record<string, unknown>).id);
    const category = try_get(video, (x) => (x.category as Record<string, unknown>).name) as string | undefined;
    return {
      id: String(video.id ?? videoId ?? ''),
      title,
      description: video.description as string | undefined,
      thumbnail: video.thumbnail_url as string | undefined,
      duration: int_or_none(video.duration) ?? undefined,
      uploader: try_get(video, (x) => (x.author as Record<string, unknown>).name) as string | undefined,
      uploader_id: uploaderId != null ? String(uploaderId) : undefined,
      timestamp: unified_timestamp(video.created_ts as string) ?? undefined,
      categories: category ? [category] : undefined,
      age_limit: ageLimit as number | undefined,
      view_count: int_or_none(video.hits) ?? undefined,
      comment_count: int_or_none(video.comments_count) ?? undefined,
      is_live: bool_or_none(video.is_livestream) ?? undefined,
    };
  }

  protected async _downloadApiOptions(videoId: string, query: Record<string, string> = {}) {
    return this._download_json<Record<string, unknown>>(
      `https://rutube.ru/api/play/options/${videoId}/`,
      videoId,
      'Downloading options JSON',
      { headers: this.geo_verification_headers(), query: { format: 'json', ...query } },
    );
  }

  protected async _extractFormatsAndSubtitles(options: Record<string, unknown>, videoId: string) {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const balancer = (options.video_balancer as Record<string, string>) || {};
    for (const [formatId, formatUrl] of Object.entries(balancer)) {
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, videoId, formatId);
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else if (ext !== 'f4m') {
        formats.push({ url: formatUrl, format_id: formatId });
      }
    }
    const liveStreams = (options.live_streams as Record<string, Array<{ url?: string }>>) || {};
    for (const hls of liveStreams.hls || []) {
      const hlsUrl = url_or_none(hls.url);
      if (!hlsUrl) continue;
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    return { formats, subtitles };
  }
}

export class RutubeIE extends RutubeBaseIE {
  static IE_NAME = 'rutube';
  static IE_DESC = 'Rutube videos';
  static _VALID_URL =
    /https?:\/\/rutube\.ru\/(?:(?:live\/)?video(?:\/private)?|(?:play\/)?embed)\/(?<id>[\da-z]{32})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._downloadApiInfo(videoId);
    const info = this._extractInfo(video, videoId);
    const options = await this._downloadApiOptions(videoId);
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(options, videoId);
    return { ...info, formats, subtitles };
  }
}

export class RutubeEmbedIE extends RutubeBaseIE {
  static IE_NAME = 'RutubeEmbed';
  static _VALID_URL = /https?:\/\/rutube\.ru\/(?:play\/)?embed\/(?<id>[\da-z]{32})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    return new RutubeIE()._real_extract(url);
  }
}

export class RutubePlaylistBaseIE extends RutubeBaseIE {
  static IE_NAME = 'RutubePlaylistBase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected async _extractPlaylist(url: string, playlistId: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, playlistId);
    const ids = [...webpage.matchAll(/href="(?:https?:\/\/rutube\.ru)?\/video\/([0-9a-z]{32})/g)].map((m) => m[1]!);
    const entries = ids.map((id) => this.url_result(`https://rutube.ru/video/${id}/`, 'Rutube', id));
    return this.playlist_result(entries, playlistId);
  }
}

export class RutubeTagsIE extends RutubePlaylistBaseIE {
  static IE_NAME = 'RutubeTags';
  static _VALID_URL = /https?:\/\/rutube\.ru\/tags\/video\/(?<id>[^/?#&]+)/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPlaylist(url, this._match_id(url));
  }
}

export class RutubeMovieIE extends RutubePlaylistBaseIE {
  static IE_NAME = 'RutubeMovie';
  static _VALID_URL = /https?:\/\/rutube\.ru\/metainfo\/movie\/(?<id>\d+)/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPlaylist(url, this._match_id(url));
  }
}

export class RutubePersonIE extends RutubePlaylistBaseIE {
  static IE_NAME = 'RutubePerson';
  static _VALID_URL = /https?:\/\/rutube\.ru\/person\/(?<id>\d+)/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPlaylist(url, this._match_id(url));
  }
}

export class RutubePlaylistIE extends RutubePlaylistBaseIE {
  static IE_NAME = 'RutubePlaylist';
  static _VALID_URL = /https?:\/\/rutube\.ru\/plst\/(?<id>\d+)/;
  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractPlaylist(url, this._match_id(url));
  }
}

export class RutubeChannelIE extends RutubePlaylistBaseIE {
  static IE_NAME = 'RutubeChannel';
  static _VALID_URL = /https?:\/\/rutube\.ru\/channel\/(?<id>\d+)/;
  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const data = await this._download_json<{ results?: Array<{ id?: string }> }>(
      `https://rutube.ru/api/video/person/${channelId}/`,
      channelId,
      undefined,
      { query: { format: 'json' } },
    );
    const entries = (data.results || []).map((v) =>
      this.url_result(`https://rutube.ru/video/${v.id}/`, 'Rutube', String(v.id)),
    );
    return this.playlist_result(entries, channelId);
  }
}
