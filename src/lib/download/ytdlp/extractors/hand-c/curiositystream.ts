/**
 * CuriosityStream family — ported from yt-dlp curiositystream.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none } from '../../utils';

export class CuriosityStreamBaseIE extends InfoExtractor {
  static IE_NAME = 'curiositystreambase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _NETRC_MACHINE = 'curiositystream';
  protected static _API_BASE_URL = '';
  private static _auth_token: string | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CuriosityStreamBaseIE is not a standalone extractor', { expected: true });
  }

  private _handleErrors(result: Record<string, unknown>): void {
    const errObj = (result.error as Record<string, unknown>) || {};
    const error = errObj.message;
    if (error) {
      const message =
        error && typeof error === 'object' ? Object.values(error as Record<string, unknown>).join(', ') : String(error);
      throw new ExtractorError(`${this.IE_NAME} said: ${message}`, { expected: true });
    }
  }

  protected async _callApi(path: string, videoId: string, query?: Record<string, string>): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {};
    const token = (this.constructor as typeof CuriosityStreamBaseIE)._auth_token;
    if (token) headers['X-Auth-Token'] = token;
    const apiBase = (this.constructor as typeof CuriosityStreamBaseIE)._API_BASE_URL;
    const result = await this._download_json<Record<string, unknown>>(apiBase + path, videoId, undefined, { headers, query });
    this._handleErrors(result);
    return (result.data as Record<string, unknown>) || {};
  }
}

export class CuriosityStreamIE extends CuriosityStreamBaseIE {
  static IE_NAME = 'curiositystream';
  static _VALID_URL = /https?:\/\/(?:app\.)?curiositystream\.com\/video\/(?<id>\d+)/;
  protected static _API_BASE_URL = 'https://api.curiositystream.com/v1/media/';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const formats: Format[] = [];
    let media: Record<string, unknown> = {};
    for (const encodingFormat of ['m3u8', 'mpd'] as const) {
      media = await this._callApi(videoId, videoId, { encodingsNew: 'true', encodingsFormat: encodingFormat });
      const encodings = Array.isArray(media.encodings) ? (media.encodings as Record<string, unknown>[]) : [];
      for (const encoding of encodings) {
        const playlistUrl = str_or_none(encoding.master_playlist_url);
        if (playlistUrl) {
          if (encodingFormat === 'm3u8') {
            formats.push(
              ...(await this._extract_m3u8_formats(playlistUrl, videoId, 'mp4', 'm3u8', undefined, undefined, 'hls', undefined, false)),
            );
          } else {
            formats.push(...(await this._extract_mpd_formats(playlistUrl, videoId, 'dash', undefined, false)));
          }
        }
        const encodingUrl = str_or_none(encoding.url);
        const fileUrl = str_or_none(encoding.file_url);
        if (!encodingUrl && !fileUrl) continue;
        const base = {
          width: int_or_none(encoding.width) ?? undefined,
          height: int_or_none(encoding.height) ?? undefined,
          vbr: int_or_none(encoding.video_bitrate) ?? undefined,
          abr: int_or_none(encoding.audio_bitrate) ?? undefined,
          filesize: int_or_none(encoding.size_in_bytes) ?? undefined,
          vcodec: (encoding.video_codec as string) ?? undefined,
          acodec: (encoding.audio_codec as string) ?? undefined,
          container: (encoding.container_type as string) ?? undefined,
        };
        for (const fUrl of [encodingUrl, fileUrl]) {
          if (!fUrl) continue;
          const rtmp = /^(?<url>rtmpe?:\/\/(?<host>[^/]+)\/(?<app>.+))\/(?<playpath>mp[34]:.+)$/.exec(fUrl);
          if (rtmp) {
            formats.push({
              ...base,
              format_id: 'rtmp',
              url: rtmp.groups!.url!,
              play_path: rtmp.groups!.playpath,
              app: rtmp.groups!.app,
              ext: 'flv',
            });
          } else {
            formats.push({ ...base, format_id: 'http', url: fUrl });
          }
        }
      }
    }

    const title = str_or_none(media.title) || videoId;

    const subtitles: Record<string, Subtitle[]> = {};
    const closedCaptions = Array.isArray(media.closed_captions) ? (media.closed_captions as Record<string, unknown>[]) : [];
    for (const cc of closedCaptions) {
      const subUrl = str_or_none(cc.file);
      if (!subUrl) continue;
      const lang = str_or_none(cc.code) || str_or_none(cc.language) || 'en';
      (subtitles[lang] ||= []).push({ url: subUrl, ext: 'vtt' });
    }

    return {
      id: videoId,
      formats,
      title,
      description: str_or_none(media.description) ?? undefined,
      thumbnail: str_or_none(media.image_large) || str_or_none(media.image_medium) || str_or_none(media.image_small) || undefined,
      duration: int_or_none(media.duration) ?? undefined,
      tags: (media.tags as string[]) ?? undefined,
      subtitles,
      channel: str_or_none(media.producer) ?? undefined,
      categories: [str_or_none(media.primary_category), str_or_none(media.type)].filter((x): x is string => !!x),
      average_rating: (media.rating_percentage as number) ?? undefined,
      series_id: str_or_none(media.collection_id) || undefined,
    };
  }
}

export class CuriosityStreamCollectionBaseIE extends CuriosityStreamBaseIE {
  async _real_extract(url: string): Promise<VideoInfo> {
    const collectionId = this._match_id(url);
    const collection = await this._callApi(collectionId, collectionId);
    const media = Array.isArray(collection.media) ? (collection.media as Record<string, unknown>[]) : [];
    const entries = media.map((m) => {
      const mediaId = String(m.id ?? '');
      const isCollection = !!m.is_collection;
      const mediaType = isCollection ? 'series' : 'video';
      const ieKey = isCollection ? 'CuriosityStreamSeries' : 'CuriosityStream';
      return this.url_result(`https://curiositystream.com/${mediaType}/${mediaId}`, ieKey, mediaId);
    });
    return this.playlist_result(entries, collectionId, str_or_none(collection.title) ?? undefined, str_or_none(collection.description) ?? undefined);
  }
}

export class CuriosityStreamCollectionsIE extends CuriosityStreamCollectionBaseIE {
  static IE_NAME = 'curiositystream:collections';
  static _VALID_URL = /https?:\/\/(?:app\.)?curiositystream\.com\/collections\/(?<id>\d+)/;
  protected static _API_BASE_URL = 'https://api.curiositystream.com/v2/collections/';
}

export class CuriosityStreamSeriesIE extends CuriosityStreamCollectionBaseIE {
  static IE_NAME = 'curiositystream:series';
  static _VALID_URL = /https?:\/\/(?:app\.)?curiositystream\.com\/(?:series|collection)\/(?<id>\d+)/;
  protected static _API_BASE_URL = 'https://api.curiositystream.com/v2/series/';
}
