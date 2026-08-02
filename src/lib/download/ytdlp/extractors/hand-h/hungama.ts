/**
 * HungamaBaseIE / HungamaIE / HungamaSongIE / HungamaAlbumPlaylistIE — ported from yt-dlp hungama.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  int_or_none,
  remove_end,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { urlencodePostdata } from './_helpers';

export class HungamaBaseIE extends InfoExtractor {
  static IE_NAME = 'hungamabase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('HungamaBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(path: string, contentId: string, fatal = false): Promise<Record<string, unknown>> {
    const res = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://cpage.api.hungama.com/v2/page/content/${contentId}/${path}/detail`,
      contentId,
      undefined,
      {
        query: { device: 'web', platform: 'a', storeId: '1' },
        fatal,
      },
    );
    return (res.data as Record<string, unknown>) || {};
  }
}

export class HungamaIE extends HungamaBaseIE {
  static IE_NAME = 'hungama';
  static _VALID_URL =
    /https?:\/\/(?:www\.|un\.)?hungama\.com\/(?:(?:video|movie|short-film)\/[^/]+\/|tv-show\/(?:[^/]+\/){2}\d+\/episode\/[^/]+\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoJson = await this._download_json<{ stream_url?: string; sub_title?: string }>(
      'https://www.hungama.com/index.php',
      videoId,
      undefined,
      {
        data: urlencodePostdata({ content_id: videoId }),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        query: { c: 'common', m: 'get_video_mdn_url' },
      },
    );
    const formats = await this._extract_m3u8_formats(
      String(videoJson.stream_url ?? ''),
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );
    const metadata = await this._callApi('movie', videoId);
    const head = (metadata.head as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const misc = (head?.misc as Record<string, unknown>) || {};

    return {
      id: videoId,
      title: head?.title != null ? String(head.title) : videoId,
      description: misc.description != null ? String(misc.description) : undefined,
      duration: int_or_none(head?.duration) ?? undefined,
      timestamp: unified_timestamp(head?.releasedate) ?? undefined,
      view_count: int_or_none(misc.playcount) ?? undefined,
      thumbnail: url_or_none(head?.image) ?? undefined,
      tags: Array.isArray(misc.keywords) ? misc.keywords.map(String) : undefined,
      formats,
      subtitles: videoJson.sub_title ? { en: [{ url: videoJson.sub_title, ext: 'vtt' }] } : undefined,
    };
  }
}

export class HungamaSongIE extends InfoExtractor {
  static IE_NAME = 'hungamasong';
  static _VALID_URL = /https?:\/\/(?:www\.|un\.)?hungama\.com\/song\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const rows = await this._download_json<Array<Record<string, unknown>>>(
      `https://www.hungama.com/audio-player-data/track/${audioId}`,
      audioId,
      undefined,
      { query: { _country: 'IN' } },
    );
    const data = rows[0] || {};
    const track = String(data.song_name ?? audioId);
    const artist = data.singer_name != null ? String(data.singer_name) : undefined;

    const mediaJson = await this._download_json<Record<string, unknown>>(
      String(data.file ?? data.preview_link ?? ''),
      audioId,
    );
    const response = (mediaJson.response as Record<string, unknown>) || {};
    const mediaUrl = response.media_url != null ? String(response.media_url) : undefined;
    const mediaType = response.type != null ? String(response.type) : 'mp3';

    const formats = mediaUrl
      ? [{ url: mediaUrl, format_id: 'audio', ext: mediaType, vcodec: 'none' as const, acodec: mediaType }]
      : [];

    return {
      id: audioId,
      title: artist ? `${artist} - ${track}` : track,
      thumbnail: (data.img_src as string | undefined) || (data.album_image as string | undefined),
      track,
      artist,
      album: (data.album_name as string | undefined) ?? undefined,
      release_year: int_or_none(data.date) ?? undefined,
      formats,
    };
  }
}

export class HungamaAlbumPlaylistIE extends HungamaBaseIE {
  static IE_NAME = 'hungamaalbumplaylist';
  static _VALID_URL = /https?:\/\/(?:www\.|un\.)?hungama\.com\/(?<path>playlists|album)\/[^/]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups!.id!;
    const path = remove_end(m.groups!.path!, 's') || m.groups!.path!;
    const data = await this._callApi(path, playlistId, true);

    const rows = traverse_obj(data, ['body', 'rows']) as Array<Record<string, unknown>> | undefined;
    const entries = (rows || [])
      .map((row) => {
        const rowData = (row.data as Record<string, unknown>) || {};
        const misc = (rowData.misc as Record<string, unknown>) || {};
        const share = url_or_none(misc.share);
        return share ? this.url_result(share, 'HungamaSong') : null;
      })
      .filter(Boolean) as VideoInfo[];

    return this.playlist_result(entries, playlistId);
  }
}
