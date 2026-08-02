/**
 * FoxNewsIE / FoxNewsVideoIE / FoxNewsArticleIE â€?ported from yt-dlp foxnews.py
 */

import { AMPIE } from '../hand-a/amp';
import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class FoxNewsIE extends AMPIE {
  static IE_NAME = 'foxnews';
  static IE_DESC = 'Fox News and Fox Business Video';
  static _VALID_URL =
    /https?:\/\/video\.(?:insider\.)?fox(?:news|business)\.com\/v\/(?:video-embed\.html\?video_id=)?(?<id>\d+)/;

  static *_extractEmbedUrls(_url: string, webpage: string): Generator<string> {
    for (const m of webpage.matchAll(
      /<(?:script|(?:amp-)?iframe)[^>]+\bsrc=["'](?:https?:)?\/\/video\.foxnews\.com\/v\/(?:video-embed\.html|embed\.js)\?(?:[^>"']+&)?(?:video_)?id=(?<video_id>\d+)/gi,
    )) {
      yield `https://video.foxnews.com/v/video-embed.html?video_id=${m.groups?.video_id || m[1]}`;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const info = await this._extract_feed_info(
      `https://api.foxnews.com/v3/video-player/${videoId}?callback=uid_${videoId}`,
    );
    info.id = videoId;
    return info;
  }
}

export class FoxNewsVideoIE extends InfoExtractor {
  static IE_NAME = 'foxnewsvideo';
  static _VALID_URL = /https?:\/\/(?:www\.)?foxnews\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(`https://video.foxnews.com/v/${videoId}`, 'FoxNews', videoId);
  }
}

export class FoxNewsArticleIE extends InfoExtractor {
  static IE_NAME = 'foxnews:article';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:insider\.)?foxnews\.com\/(?!v)([^/]+\/)+(?<id>[a-z-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoId = this._html_search_regex(
      /data-video-id=(['"])(?<id>[^'"]+)\1/,
      webpage,
      'video ID',
      'id',
      false,
    );
    if (videoId) {
      return this.url_result(`http://video.foxnews.com/v/${videoId}`, 'FoxNews');
    }
    const embed = [...FoxNewsIE._extractEmbedUrls(url, webpage)][0];
    if (!embed) throw new Error('No embedded Fox News video found');
    return this.url_result(embed, 'FoxNews');
  }
}
