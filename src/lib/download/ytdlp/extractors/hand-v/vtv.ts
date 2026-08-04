// @ts-nocheck
/**
 * VTVGoIE / VTVIE â€?ported from yt-dlp vtv.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes, remove_start } from '../../utils';

function getElementHtmlByClass(cls: string, html: string): string | null {
  const re = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\sclass=["'][^"']*\\b${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[0] ?? null;
}

export class VTVGoIE extends InfoExtractor {
  static IE_NAME = 'vtvgo';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = [
    /https?:\/\/(?:www\.)?vtvgo\.vn\/(kho-video|tin-tuc)\/[\w.-]*?(?<id>\d+)(?:\.[a-z]+|\/)?(?:$|[?#])/,
    /https?:\/\/(?:www\.)?vtvgo\.vn\/digital\/detail\.php\?(?:[^#]+&)?content_id=(?<id>\d+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const m3u8Url = this._search_regex(
      /(?:var\s+link\s*=\s*|addPlayer\()["'](https:\/\/[^"']+\/index\.m3u8)["']/,
      webpage,
      'm3u8 url',
    )!;
    return {
      id: videoId,
      title: this._og_search_title(webpage, false) || videoId,
      description: this._og_search_description(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats: await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4'),
    };
  }
}

export class VTVIE extends InfoExtractor {
  static IE_NAME = 'vtv';
  static _VALID_URL = /https?:\/\/(?:www\.)?vtv\.vn\/video\/[\w-]*?(?<id>\d+)\.htm/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const box = getElementHtmlByClass('video-highlight-box', webpage);
    const sortable = box ? getElementHtmlByClass('VCSortableInPreviewMode', box) : null;
    const dataVid = sortable ? extract_attributes(sortable)['data-vid'] : undefined;
    if (!dataVid) {
      throw new ExtractorError('Unable to extract data-vid', { expected: true });
    }
    const m3u8Url = `https://cdn-videos.vtv.vn/${remove_start(dataVid, 'vtv.mediacdn.vn/')}/master.m3u8`;
    return {
      id: videoId,
      title: this._og_search_title(webpage, false) || videoId,
      description: this._og_search_description(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      formats: await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4'),
    };
  }
}
