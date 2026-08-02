/**
 * AcFunVideoIE / AcFunBangumiIE — aligned with yt-dlp acfun.py
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import {
  float_or_none,
  int_or_none,
  parse_codecs,
  str_or_none,
  traverse_obj,
} from '../utils';

function extractTagNames(tagList: unknown): string[] | undefined {
  if (!Array.isArray(tagList)) return undefined;
  const tags = tagList
    .map((t) => String((t as Record<string, unknown>).name || ''))
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

const AC_HEADERS: Record<string, string> = {
  Referer: 'https://www.acfun.cn/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export class AcFunVideoBaseIE extends InfoExtractor {
  static IE_NAME = 'AcFunVideoBase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AcFunVideoBaseIE is not a standalone extractor', { expected: true });
  }

  async extractMetadata(
    videoId: string,
    videoInfo: Record<string, unknown>,
  ): Promise<Pick<VideoInfo, 'id' | 'formats' | 'duration' | 'timestamp' | 'http_headers'>> {
    const playjson = this._parse_json(
      String(videoInfo.ksPlayJson || ''),
      videoId,
    ) as Record<string, unknown>;
    const representations = traverse_obj(playjson, ['adaptationSet', 0, 'representation']) as
      | Record<string, unknown>[]
      | undefined;

    const formats: Format[] = [];
    for (const video of representations || []) {
      const m3u8Url = String(video.url || '');
      if (!m3u8Url) continue;
      const fmts = await this._extract_m3u8_formats(
        m3u8Url,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
        { headers: AC_HEADERS },
      );
      const codecs = parse_codecs(String(video.codecs || ''));
      for (const f of fmts) {
        formats.push({
          ...f,
          fps: float_or_none(video.frameRate),
          width: int_or_none(video.width),
          height: int_or_none(video.height),
          tbr: float_or_none(video.avgBitrate),
          ...codecs,
          http_headers: AC_HEADERS,
        });
      }
    }

    if (!formats.length) {
      throw new ExtractorError('No AcFun formats found', { expected: true });
    }

    return {
      id: videoId,
      formats,
      duration: float_or_none(videoInfo.durationMillis, 1000),
      timestamp: int_or_none(videoInfo.uploadTime, 1000),
      http_headers: AC_HEADERS,
    };
  }
}

export class AcFunVideoIE extends AcFunVideoBaseIE {
  static IE_NAME = 'acfun:video';
  static IE_DESC = 'AcFun.cn';
  static _VALID_URL = /https?:\/\/www\.acfun\.cn\/v\/ac(?<id>[_\d]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId, 'Downloading AcFun webpage', {
      headers: AC_HEADERS,
    });
    const jsonAll = this._search_json<Record<string, unknown>>(
      /window\.videoInfo\s*=/,
      webpage,
      'videoInfo',
      videoId,
    );
    if (!jsonAll) throw new ExtractorError('Unable to extract AcFun videoInfo', { expected: true });

    let title = String(jsonAll.title || videoId);
    const videoList = (jsonAll.videoList as Record<string, unknown>[]) || [];
    const videoInternalId = traverse_obj(jsonAll, ['currentVideoInfo', 'id']);
    if (videoInternalId && videoList.length > 1) {
      const idx = videoList.findIndex((v) => v.id === videoInternalId);
      if (idx >= 0) {
        const part = videoList[idx]!;
        title = `${title} P${String(idx + 1).padStart(2, '0')} ${String(part.title || '')}`.trim();
      }
    }

    const currentVideoInfo = jsonAll.currentVideoInfo as Record<string, unknown>;
    if (!currentVideoInfo) {
      throw new ExtractorError('Missing AcFun currentVideoInfo', { expected: true });
    }

    const meta = await this.extractMetadata(videoId, currentVideoInfo);
    return {
      ...meta,
      title,
      thumbnail: str_or_none(jsonAll.coverUrl) || undefined,
      description: str_or_none(jsonAll.description) || null,
      uploader: str_or_none(traverse_obj(jsonAll, ['user', 'name'])) || undefined,
      uploader_id: str_or_none(traverse_obj(jsonAll, ['user', 'href'])) || undefined,
      tags: extractTagNames(jsonAll.tagList),
      view_count: int_or_none(jsonAll.viewCount),
      like_count: int_or_none(jsonAll.likeCountShow),
      comment_count: int_or_none(jsonAll.commentCountShow),
      webpage_url: url,
      original_url: url,
      extractor: 'acfun:video',
      extractor_key: 'AcFunVideo',
    };
  }
}

export class AcFunBangumiIE extends AcFunVideoBaseIE {
  static IE_NAME = 'acfun:bangumi';
  static IE_DESC = 'AcFun.cn bangumi';
  static _VALID_URL = /https?:\/\/www\.acfun\.cn\/bangumi\/(?<id>aa[_\d]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    const acIdx = new URL(url).searchParams.get('ac');
    if (acIdx) videoId = `${videoId}__${acIdx}`;

    const webpage = await this._download_webpage(url, videoId, 'Downloading AcFun bangumi webpage', {
      headers: AC_HEADERS,
    });
    const bangumiData = this._search_json<Record<string, unknown>>(
      /window\.bangumiData\s*=/,
      webpage,
      'bangumiData',
      videoId,
    );
    if (!bangumiData) {
      throw new ExtractorError('Unable to extract AcFun bangumiData', { expected: true });
    }

    if (acIdx) {
      const videoInfo = bangumiData.hlVideoInfo as Record<string, unknown>;
      const meta = await this.extractMetadata(videoId, videoInfo);
      return {
        ...meta,
        title: String(videoInfo.title || videoId),
        webpage_url: url,
        original_url: url,
        extractor: 'acfun:bangumi',
        extractor_key: 'AcFunBangumi',
      };
    }

    const videoInfo = bangumiData.currentVideoInfo as Record<string, unknown>;
    if (!videoInfo) {
      throw new ExtractorError('Missing AcFun bangumi currentVideoInfo', { expected: true });
    }

    const seasonId = bangumiData.bangumiId;
    const related = (bangumiData.relatedBangumis as Record<string, unknown>[]) || [];
    const seasonNumber =
      seasonId != null
        ? related.findIndex((v) => v.id === seasonId) + 1 || 1
        : undefined;

    const bangumiList = this._search_json<Record<string, unknown>>(
      /window\.bangumiList\s*=/,
      webpage,
      'bangumiList',
      videoId,
      { fatal: false },
    );
    const videoInternalId = int_or_none(traverse_obj(bangumiData, ['currentVideoInfo', 'id']));
    const items = (bangumiList?.items as Record<string, unknown>[]) || [];
    const episodeNumber =
      videoInternalId != null
        ? items.findIndex((v) => v.videoId === videoInternalId) + 1 || undefined
        : undefined;

    const meta = await this.extractMetadata(videoId, videoInfo);
    return {
      ...meta,
      title: String(bangumiData.showTitle || videoId),
      thumbnail: str_or_none(bangumiData.image) || undefined,
      season: str_or_none(bangumiData.bangumiTitle) || undefined,
      season_id: str_or_none(seasonId) || undefined,
      season_number: seasonNumber && seasonNumber > 0 ? seasonNumber : undefined,
      episode: str_or_none(bangumiData.title) || undefined,
      episode_number: episodeNumber && episodeNumber > 0 ? episodeNumber : undefined,
      comment_count: int_or_none(bangumiData.commentCount),
      webpage_url: url,
      original_url: url,
      extractor: 'acfun:bangumi',
      extractor_key: 'AcFunBangumi',
    };
  }
}
