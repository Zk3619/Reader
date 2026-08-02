/**
 * GronkhIE / GronkhFeedIE / GronkhVodsIE — ported from yt-dlp gronkh.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, traverse_obj, unified_strdate } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class GronkhIE extends InfoExtractor {
  static IE_NAME = 'gronkh';
  static _VALID_URL = /https?:\/\/(?:www\.)?gronkh\.tv\/(?:watch\/)?streams?\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const dataJson = await this._download_json<Record<string, unknown>>(
      `https://api.gronkh.tv/v1/video/info?episode=${videoId}`,
      videoId,
    );
    const m3u8Url = (
      await this._download_json<{ playlist_url?: string }>(
        `https://api.gronkh.tv/v1/video/playlist?episode=${videoId}`,
        videoId,
      )
    ).playlist_url!;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId);
    if (dataJson.vtt_url) {
      (subtitles.en ||= []).push({ url: String(dataJson.vtt_url), ext: 'vtt' });
    }
    const chapters = ((dataJson.chapters as Array<Record<string, unknown>>) || [])
      .filter((v) => float_or_none(v.offset) != null)
      .map((v) => ({
        title: String(v.title ?? ''),
        start_time: float_or_none(v.offset) ?? 0,
      }));

    return {
      id: videoId,
      title: dataJson.title as string | undefined,
      view_count: dataJson.views as number | undefined,
      thumbnail: dataJson.preview_url as string | undefined,
      upload_date: unified_strdate(dataJson.created_at as string | undefined) ?? undefined,
      formats,
      subtitles,
      duration: float_or_none(dataJson.source_length) ?? undefined,
      chapters: chapters?.length ? chapters : undefined,
    };
  }
}

export class GronkhFeedIE extends InfoExtractor {
  static IE_NAME = 'gronkh:feed';
  static _VALID_URL = /https?:\/\/(?:www\.)?gronkh\.tv(?:\/feed)?\/?(?:#|$)/;

  protected async *_entries(): AsyncGenerator<VideoInfo> {
    for (const type of ['recent', 'views'] as const) {
      const info = await this._download_json<Record<string, unknown>>(
        `https://api.gronkh.tv/v1/video/discovery/${type}`,
        'feed',
        `Downloading ${type} API JSON`,
      );
      for (const item of (info.discovery as Array<Record<string, unknown>>) || []) {
        yield this.url_result(
          `https://gronkh.tv/watch/stream/${item.episode}`,
          'Gronkh',
          String(item.episode ?? ''),
          item.title as string | undefined,
        );
      }
    }
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    const entries: VideoInfo[] = [];
    for await (const e of this._entries()) entries.push(e);
    return this.playlist_result(entries, 'feed');
  }
}

export class GronkhVodsIE extends InfoExtractor {
  static IE_NAME = 'gronkh:vods';
  static _VALID_URL = /https?:\/\/(?:www\.)?gronkh\.tv\/vods\/streams\/?(?:#|$)/;

  static _PER_PAGE = 25;

  protected async _fetchPage(page: number): Promise<VideoInfo[]> {
    const items = traverse_obj(
      await this._download_json<Record<string, unknown>>('https://api.gronkh.tv/v1/search', 'vods', undefined, {
        query: { offset: String(GronkhVodsIE._PER_PAGE * page), first: String(GronkhVodsIE._PER_PAGE) },
      }),
      ['results', 'videos', 'ALL'],
    ) as Array<Record<string, unknown>> | undefined;

    return (items || []).map((item) =>
      this.url_result(
        `https://gronkh.tv/watch/stream/${item.episode}`,
        'Gronkh',
        String(item.episode ?? ''),
        item.title as string | undefined,
      ),
    );
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const batch = await this._fetchPage(page);
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < GronkhVodsIE._PER_PAGE) break;
    }
    return this.playlist_result(entries, 'vods');
  }
}
