/**
 * KikaIE / KikaPlaylistIE — ported from yt-dlp kika.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  parse_duration,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

export class KikaIE extends InfoExtractor {
  static IE_NAME = 'kika';
  static IE_DESC = 'KiKA.de';
  static _GEO_COUNTRIES = ['DE'];
  static _VALID_URL = /https?:\/\/(?:www\.)?kika\.de\/[\w/-]+\/videos\/(?<id>[a-z-]+\d+)/;

  protected async *_extractFormats(
    mediaInfo: Record<string, unknown>,
    videoId: string,
  ): AsyncGenerator<Format> {
    for (const media of (mediaInfo.assets as Array<Record<string, unknown>>) || []) {
      const streamUrl = url_or_none(media.url);
      if (!streamUrl) continue;
      const ext = determine_ext(streamUrl);
      if (ext === 'm3u8') {
        const fmts = await this._extract_m3u8_formats(streamUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
        yield* fmts;
      } else {
        const filesize = int_or_none(media.fileSize);
        const abrRaw = int_or_none(media.bitrateAudio);
        const vbrRaw = int_or_none(media.bitrateVideo);
        yield {
          url: streamUrl,
          format_id: ext,
          width: int_or_none(media.frameWidth) ?? undefined,
          height: int_or_none(media.frameHeight) ?? undefined,
          filesize: filesize || undefined,
          abr: abrRaw === -1 ? undefined : abrRaw ?? undefined,
          vbr: vbrRaw === -1 ? undefined : vbrRaw ?? undefined,
        };
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const doc = await this._download_json<Record<string, unknown>>(
      `https://www.kika.de/_next-api/proxy/v1/videos/${videoId}`,
      videoId,
    );
    const assetsUrl = traverse_obj(doc, ['assets', 'url']) as string;
    const videoAssets = await this._download_json<Record<string, unknown>>(assetsUrl, videoId);

    const subtitles: Record<string, Subtitle[]> = {};
    if (doc.hasSubtitle) {
      const ttml = url_or_none(videoAssets.videoSubtitle);
      if (ttml) subtitles.de = [{ url: ttml, ext: 'ttml' }];
      const webvtt = url_or_none(videoAssets.webvttUrl);
      if (webvtt) (subtitles.de ||= []).push({ url: webvtt, ext: 'vtt' });
    }

    const formats: Format[] = [];
    for await (const fmt of this._extractFormats(videoAssets, videoId)) {
      formats.push(fmt);
    }

    const durationFromSeconds = int_or_none(doc.durationInSeconds);
    const durationFromStr = parse_duration(doc.duration);

    return {
      id: videoId,
      formats,
      subtitles,
      title: str_or_none(doc.title) ?? undefined,
      description: str_or_none(doc.description) ?? undefined,
      timestamp: parseIso8601(doc.date) ?? undefined,
      modified_timestamp: parseIso8601(doc.modificationDate) ?? undefined,
      duration: durationFromSeconds ?? durationFromStr ?? undefined,
      episode_number: int_or_none(doc.episodeNumber) ?? undefined,
      season_number: int_or_none(doc.season) ?? undefined,
    };
  }
}

export class KikaPlaylistIE extends InfoExtractor {
  static IE_NAME = 'kika:playlist';
  static _VALID_URL = /https?:\/\/(?:www\.)?kika\.de\/[\w-]+\/(?<id>[a-z-]+\d+)/;

  protected async *_entries(playlistUrl: string, playlistId: string): AsyncGenerator<VideoInfo> {
    let nextUrl: string | null = playlistUrl;
    for (let page = 1; nextUrl; page++) {
      const data = await this._download_json<Record<string, unknown>>(nextUrl, playlistId, `Downloading page ${page}`);
      for (const item of (data.content as Array<Record<string, unknown>>) || []) {
        const apiUrl = url_or_none(traverse_obj(item, ['api', 'url']));
        if (!apiUrl) continue;
        yield this.url_result(apiUrl, 'Kika', str_or_none(item.id) ?? undefined, str_or_none(item.title) ?? undefined);
      }
      nextUrl = url_or_none(traverse_obj(data, ['links', 'next']));
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const brandData = await this._download_json<Record<string, unknown>>(
      `https://www.kika.de/_next-api/proxy/v1/brands/${playlistId}`,
      playlistId,
    );
    const subchannel = (brandData.videoSubchannel as Record<string, unknown>) || {};

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(String(subchannel.videosPageUrl ?? ''), playlistId)) {
      entries.push(entry);
    }

    return this.playlist_result(
      entries,
      playlistId,
      str_or_none(brandData.title) ?? undefined,
      str_or_none(brandData.description) ?? undefined,
    );
  }
}
