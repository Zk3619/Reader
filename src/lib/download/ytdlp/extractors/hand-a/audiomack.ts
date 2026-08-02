/**
 * AudiomackIE / AudiomackAlbumIE — aligned with yt-dlp audiomack.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { SoundcloudIE } from '../sites';

export class AudiomackIE extends InfoExtractor {
  static IE_NAME = 'audiomack';
  static _VALID_URL = /https?:\/\/(?:www\.)?audiomack\.com\/(?:song\/|(?=.+\/song\/))(?<id>[\w/-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumUrlTag = this._match_id(url).replace('/song/', '/');
    const apiResponse = await this._download_json<Record<string, unknown>>(
      `http://www.audiomack.com/api/music/url/song/${albumUrlTag}?extended=1&_=${Date.now()}`,
      albumUrlTag,
    );

    if (!apiResponse.url || apiResponse.error) {
      throw new ExtractorError(`Invalid url ${url}`, { expected: true });
    }

    const streamUrl = String(apiResponse.url);
    if (SoundcloudIE.suitable(streamUrl)) {
      return this.url_result(streamUrl, 'Soundcloud');
    }

    return {
      id: String(apiResponse.id || albumUrlTag),
      uploader: apiResponse.artist != null ? String(apiResponse.artist) : undefined,
      title: apiResponse.title != null ? String(apiResponse.title) : undefined,
      url: streamUrl,
      formats: [{ format_id: 'direct', url: streamUrl, ext: 'mp3' }],
      webpage_url: url,
      original_url: url,
      extractor: 'audiomack',
      extractor_key: 'Audiomack',
    };
  }
}

export class AudiomackAlbumIE extends InfoExtractor {
  static IE_NAME = 'audiomack:album';
  static _VALID_URL = /https?:\/\/(?:www\.)?audiomack\.com\/(?:album\/|(?=.+\/album\/))(?<id>[\w/-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const albumUrlTag = this._match_id(url).replace('/album/', '/');
    const result: VideoInfo = { _type: 'playlist', id: albumUrlTag, entries: [] };

    for (let trackNo = 0; ; trackNo++) {
      const apiResponse = await this._download_json<Record<string, unknown>>(
        `http://www.audiomack.com/api/music/url/album/${albumUrlTag}/${trackNo}?extended=1&_=${Date.now()}`,
        albumUrlTag,
        `Querying song information (${trackNo + 1})`,
      );

      if (!('url' in apiResponse) || apiResponse.error) {
        throw new ExtractorError(`Invalid url for track ${trackNo} of album url ${url}`, { expected: true });
      }
      if (!apiResponse.url) break;

      if (apiResponse.album_id != null && !result.id) result.id = String(apiResponse.album_id);
      if (apiResponse.album_title != null && !result.title) result.title = String(apiResponse.album_title);

      const songId = String(apiResponse.url).split('/').pop()?.split('.')[0] || String(trackNo);
      result.entries!.push({
        id: String(apiResponse.id || songId),
        uploader: apiResponse.artist != null ? String(apiResponse.artist) : undefined,
        title: apiResponse.title != null ? String(apiResponse.title) : songId,
        url: String(apiResponse.url),
        formats: [{ format_id: 'direct', url: String(apiResponse.url), ext: 'mp3' }],
      });
    }

    return result;
  }
}
