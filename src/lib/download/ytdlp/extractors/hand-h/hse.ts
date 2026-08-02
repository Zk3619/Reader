/**
 * HSEShowBaseIE / HSEShowIE / HSEProductIE — ported from yt-dlp hse.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { traverse_obj, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class HSEShowBaseIE extends InfoExtractor {
  static IE_NAME = 'hseshowbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('HSEShowBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractReduxData(url: string, videoId: string): Promise<Record<string, unknown>> {
    const webpage = await this._download_webpage(url, videoId);
    const redux = this._html_search_regex(/window\.__REDUX_DATA__\s*=\s*({[\s\S]*?});?/, webpage, 'redux data');
    if (!redux) throw new ExtractorError('Unable to extract redux data', { expected: true });
    return this._parse_json<Record<string, unknown>>(redux.replace(/\n/g, ''), videoId) ?? {};
  }

  protected async _extractFormatsAndSubtitles(
    sources: Array<Record<string, unknown>> | undefined,
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    if (!sources?.length) {
      throw new ExtractorError('No video found', { expected: true });
    }
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const src of sources) {
      if (src.mimetype !== 'application/x-mpegURL') continue;
      const res = await extractM3u8FormatsAndSubtitles(this, String(src.url ?? ''), videoId);
      formats = formats.concat(res.formats);
      subtitles = mergeSubtitles(subtitles, res.subtitles);
    }
    return { formats, subtitles };
  }
}

export class HSEShowIE extends HSEShowBaseIE {
  static IE_NAME = 'hseshow';
  static _VALID_URL = /https?:\/\/(?:www\.)?hse\.de\/dpl\/c\/tv-shows\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const jsonData = await this._extractReduxData(url, videoId);
    const sources = traverse_obj(jsonData, ['tvShowPage', 'tvShowVideo', 'sources']) as
      | Array<Record<string, unknown>>
      | undefined;
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(sources, videoId);

    const show = (traverse_obj(jsonData, ['tvShowPage', 'tvShow']) as Record<string, unknown>) || {};
    const date = show.date as string | undefined;
    const hour = show.hour as string | undefined;

    return {
      id: videoId,
      title: (show.title as string | undefined) || videoId,
      formats,
      timestamp: date && hour ? (unified_timestamp(`${date} ${hour}:00`) ?? undefined) : undefined,
      thumbnail: (traverse_obj(jsonData, ['tvShowVideo', 'poster']) as string | undefined) ?? undefined,
      channel:
        this._search_regex(/tvShow \| ([A-Z0-9]+)_/, String(show.actionFieldText ?? ''), videoId, null, false) ??
        undefined,
      uploader: (show.presenter as string | undefined) ?? undefined,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}

export class HSEProductIE extends HSEShowBaseIE {
  static IE_NAME = 'hseproduct';
  static _VALID_URL = /https?:\/\/(?:www\.)?hse\.de\/dpl\/p\/product\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const jsonData = await this._extractReduxData(url, videoId);
    const video =
      (traverse_obj(jsonData, ['productContent', 'productContent', 'videos', 0]) as Record<string, unknown>) ||
      {};
    const { formats, subtitles } = await this._extractFormatsAndSubtitles(
      video.sources as Array<Record<string, unknown>> | undefined,
      videoId,
    );

    return {
      id: videoId,
      title:
        (traverse_obj(jsonData, ['productDetail', 'product', 'name', 'short']) as string | undefined) || videoId,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      thumbnail: (video.poster as string | undefined) ?? undefined,
      uploader:
        (traverse_obj(jsonData, ['productDetail', 'product', 'brand', 'brandName']) as string | undefined) ??
        undefined,
    };
  }
}
