/**
 * FilmOnIE / FilmOnChannelIE â€?ported from yt-dlp filmon.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { qualityRank } from './_helpers';

const STREAM_QUALITY = qualityRank(['low', 'high']);

export class FilmOnIE extends InfoExtractor {
  static IE_NAME = 'filmon';
  static _VALID_URL = /(?:https?:\/\/(?:www\.)?filmon\.com\/vod\/view\/|filmon:)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let response: Record<string, unknown>;
    try {
      response = (
        await this._download_json<{ response?: Record<string, unknown> }>(
          `https://www.filmon.com/api/vod/movie?id=${videoId}`,
          videoId,
        )
      ).response!;
    } catch (e) {
      throw new ExtractorError(`${FilmOnIE.IE_NAME} said: ${(e as Error).message}`, { expected: true });
    }

    const title = String(response.title ?? videoId);
    const description =
      typeof response.description === 'string' ? response.description.trim() || undefined : undefined;

    if (response.type_id === 1) {
      const episodes = (response.episodes as string[]) || [];
      const entries = episodes.map((ep) => this.url_result(`filmon:${ep}`, 'FilmOn'));
      return this.playlist_result(entries, videoId, title, description);
    }

    const streams = (response.streams as Record<string, Record<string, unknown>>) || {};
    const formats: Format[] = [];
    for (const [formatId, stream] of Object.entries(streams)) {
      const streamUrl = stream.url;
      if (typeof streamUrl !== 'string' || !streamUrl) continue;
      formats.push({
        format_id: formatId,
        url: streamUrl,
        ext: 'mp4',
        quality: STREAM_QUALITY(String(stream.quality ?? '')),
        protocol: 'm3u8_native',
      });
    }

    const thumbnails: Thumbnail[] = [];
    const poster = (response.poster as Record<string, unknown>) || {};
    const thumbs = { ...(poster.thumbs as Record<string, Record<string, unknown>>), poster };
    for (const [thumbId, thumb] of Object.entries(thumbs)) {
      const thumbUrl = thumb?.url;
      if (typeof thumbUrl !== 'string') continue;
      thumbnails.push({
        id: thumbId,
        url: thumbUrl,
        width: int_or_none(thumb.width) ?? undefined,
        height: int_or_none(thumb.height) ?? undefined,
      });
    }

    return { id: videoId, title, formats, description, thumbnails };
  }
}

export class FilmOnChannelIE extends InfoExtractor {
  static IE_NAME = 'filmon:channel';
  static _VALID_URL = /https?:\/\/(?:www\.)?filmon\.com\/(?:tv|channel)\/(?<id>[a-z0-9-]+)/;

  static _THUMBNAIL_RES: Array<[string, number, number]> = [
    ['logo', 56, 28],
    ['big_logo', 106, 106],
    ['extra_big_logo', 300, 300],
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    let channelId = this._match_id(url);
    let channelData: Record<string, unknown>;
    try {
      channelData = (
        await this._download_json<{ data?: Record<string, unknown> }>(
          `http://www.filmon.com/api-v2/channel/${channelId}`,
          channelId,
        )
      ).data!;
    } catch (e) {
      throw new ExtractorError(`${FilmOnChannelIE.IE_NAME} said: ${(e as Error).message}`, { expected: true });
    }

    channelId = String(channelData.id ?? channelId);
    const isLive = !channelData.is_vod && !channelData.is_vox;
    const title = String(channelData.title ?? channelId);
    const streams = (channelData.streams as Array<Record<string, unknown>>) || [];
    const formats: Format[] = [];

    for (const stream of streams) {
      const streamUrl = stream.url;
      if (typeof streamUrl !== 'string' || !streamUrl) continue;
      if (!isLive) {
        formats.push({
          url: streamUrl,
          format_id: 'http',
          ext: 'mp4',
        });
        continue;
      }
      const quality = String(stream.quality ?? '');
      formats.push({
        format_id: quality,
        url: streamUrl,
        ext: 'mp4',
        quality: STREAM_QUALITY(quality),
      });
    }

    const thumbnails: Thumbnail[] = FilmOnChannelIE._THUMBNAIL_RES.map(([name, width, height]) => ({
      id: name,
      url: `http://static.filmon.com/assets/channels/${channelId}/${name}.png`,
      width,
      height,
    }));

    return {
      id: channelId,
      display_id: channelData.alias as string | undefined,
      title,
      description: channelData.description as string | undefined,
      thumbnails,
      formats,
      is_live: isLive,
    };
  }
}
