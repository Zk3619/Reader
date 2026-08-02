/**
 * MirrativBaseIE / MirrativIE / MirrativUserIE — ported from yt-dlp mirrativ.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { dict_get, int_or_none, str_or_none, traverse_obj, try_get } from '../../utils';

export class MirrativBaseIE extends InfoExtractor {
  static IE_NAME = 'mirrativbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MirrativBaseIE is not a standalone extractor', { expected: true });
  }

  protected assertError(response: Record<string, unknown>): void {
    const errorMessage = traverse_obj(response, ['status', 'error']);
    if (errorMessage) {
      throw new ExtractorError(`Mirrativ says: ${errorMessage}`, { expected: true });
    }
  }
}

export class MirrativIE extends MirrativBaseIE {
  static IE_NAME = 'mirrativ';
  static _VALID_URL = /https?:\/\/(?:www\.)?mirrativ\.com\/live\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`https://www.mirrativ.com/live/${videoId}`, videoId);
    const liveResponse = await this._download_json<Record<string, unknown>>(
      `https://www.mirrativ.com/api/live/live?live_id=${videoId}`,
      videoId,
    );
    this.assertError(liveResponse);

    const hlsUrl = dict_get(liveResponse, ['archive_url_hls', 'streaming_url_hls']) as string | null;
    const isLive = !!liveResponse.is_live;
    if (!hlsUrl) {
      throw new ExtractorError('Neither archive nor live is available.', { expected: true });
    }

    const formats = await this._extract_m3u8_formats(
      String(hlsUrl),
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    const titleMatch = webpage.match(/<title>\s*(.+?) - Mirrativ\s*<\/title>/);

    return {
      id: videoId,
      title:
        this._og_search_title(webpage) ||
        (titleMatch?.[1]?.trim() ?? undefined) ||
        str_or_none(liveResponse.title) ||
        videoId,
      is_live: isLive,
      description: str_or_none(liveResponse.description) ?? undefined,
      formats,
      thumbnail: str_or_none(liveResponse.image_url) ?? undefined,
      uploader: traverse_obj(liveResponse, ['owner', 'name']) as string | undefined,
      uploader_id: traverse_obj(liveResponse, ['owner', 'user_id']) as string | undefined,
      duration: isLive
        ? undefined
        : try_get(liveResponse, (x: Record<string, unknown>) =>
            Number(x.ended_at) - Number(x.started_at),
          ) ?? undefined,
      view_count: int_or_none(liveResponse.total_viewer_num) ?? undefined,
      release_timestamp: int_or_none(liveResponse.started_at) ?? undefined,
      timestamp: int_or_none(liveResponse.created_at) ?? undefined,
      was_live: !!liveResponse.is_archive,
    };
  }
}

export class MirrativUserIE extends MirrativBaseIE {
  static IE_NAME = 'mirrativ:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?mirrativ\.com\/user\/(?<id>\d+)/;

  protected async *_entries(userId: string): AsyncGenerator<VideoInfo> {
    let page: number | null = 1;
    while (page != null) {
      const apiResponse = await this._download_json<Record<string, unknown>>(
        `https://www.mirrativ.com/api/live/live_history?user_id=${userId}&page=${page}`,
        userId,
        `Downloading page ${page}`,
      );
      this.assertError(apiResponse);
      const lives = (apiResponse.lives as Array<Record<string, unknown>>) || [];
      if (!lives.length) break;
      for (const live of lives) {
        if (!live.is_archive && !live.is_live) continue;
        const liveId = str_or_none(live.live_id);
        if (!liveId) continue;
        yield this.url_result(
          `https://www.mirrativ.com/live/${liveId}`,
          'mirrativ',
          liveId,
          str_or_none(live.title) ?? undefined,
        );
      }
      page = int_or_none(apiResponse.next_page);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_id(url);
    const userInfo = await this._download_json<Record<string, unknown>>(
      `https://www.mirrativ.com/api/user/profile?user_id=${userId}`,
      userId,
      'Downloading user info',
      { fatal: false },
    );
    this.assertError(userInfo);

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(userId)) entries.push(entry);

    return this.playlist_result(
      entries,
      userId,
      str_or_none(userInfo.name) ?? undefined,
      str_or_none(userInfo.description) ?? undefined,
    );
  }
}
