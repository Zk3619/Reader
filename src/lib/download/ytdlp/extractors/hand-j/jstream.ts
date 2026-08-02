/**
 * JStreamIE — ported from yt-dlp jstream.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, remove_start } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class JStreamIE extends InfoExtractor {
  static IE_NAME = 'jstream';
  static _VALID_URL =
    /jstream:(?<host>www\d+):(?<id>(?<publisher>[a-z0-9]+):(?<mid>\d+))/;

  protected _parseJsonp(callback: string, text: string, videoId: string): Record<string, unknown> {
    return (
      this._search_json<Record<string, unknown>>(
        new RegExp(`\\s*${callback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`),
        text,
        callback,
        videoId,
      ) || {}
    );
  }

  protected async *_findFormats(
    videoId: string,
    movieListHls: Array<Record<string, unknown>> | undefined,
    host: string,
    publisher: string,
    subtitles: Record<string, Subtitle[]>,
  ): AsyncGenerator<Format> {
    for (const value of movieListHls || []) {
      const text = String(value.text ?? '');
      if (!text.startsWith('auto')) continue;
      const m3u8Id = remove_start(remove_start(text, 'auto'), '_') || undefined;
      const relUrl = String(value.url ?? '');
      const m3u8Url = `https://${publisher}.eq.webcdn.stream.ne.jp/${host}/${publisher}/jmc_pub/${relUrl}`;
      const { formats, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
        this,
        m3u8Url,
        videoId,
        m3u8Id || 'hls',
      );
      mergeSubtitles(subtitles, subs);
      yield* formats;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const host = m.groups?.host ?? '';
    const publisher = m.groups?.publisher ?? '';
    const videoId = m.groups?.id ?? '';
    const mid = m.groups?.mid ?? '';

    const videoInfoJsonp = await this._download_webpage(
      `https://${publisher}.eq.webcdn.stream.ne.jp/${host}/${publisher}/jmc_pub/eq_meta/v1/${mid}.jsonp`,
      videoId,
      'Requesting video info',
    );
    const videoInfo = (this._parseJsonp('metaDataResult', videoInfoJsonp, videoId).movie as Record<string, unknown>) || {};

    const subtitles: Record<string, Subtitle[]> = {};
    const formats: Format[] = [];
    for await (const fmt of this._findFormats(
      videoId,
      videoInfo.movie_list_hls as Array<Record<string, unknown>> | undefined,
      host,
      publisher,
      subtitles,
    )) {
      formats.push(fmt);
    }

    const seen = new Set<string>();
    const deduped = formats.filter((f) => {
      const key = f.url || f.format_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const thumb = videoInfo.thumbnail_url;
    return {
      id: videoId,
      title: videoInfo.title != null ? String(videoInfo.title) : undefined,
      duration: float_or_none(videoInfo.duration) ?? undefined,
      thumbnail: thumb ? String(thumb) : undefined,
      formats: deduped,
      subtitles,
    };
  }
}
