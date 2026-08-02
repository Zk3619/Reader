/** SkyNewsArabia family â€?ported from yt-dlp skynewsarabia.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration } from '../../utils';
import { parseIso8601 } from './_helpers';

export class SkyNewsArabiaBaseIE extends InfoExtractor {
  static IE_NAME = 'skynewsarabia:base';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _IMAGE_BASE_URL = 'http://www.skynewsarabia.com/web/images';

  async _real_extract(_url: string): Promise<VideoInfo> {
    return this.url_result('', 'generic');
  }

  protected async _callApi(path: string, value: string): Promise<Record<string, unknown>> {
    return this._download_json(`http://api.skynewsarabia.com/web/rest/v2/${path}/${value}.json`, value);
  }

  protected _getLimelightMediaId(url: string): string {
    return this._search_regex(/\/media\/[^/]+\/([a-z0-9]{32})/, url, 'limelight media id')!;
  }

  protected _getImageUrl(imagePathTemplate: string): string {
    return SkyNewsArabiaBaseIE._IMAGE_BASE_URL + imagePathTemplate.replace('{width}', '1600').replace('{height}', '1200');
  }

  protected _extractVideoInfo(videoData: Record<string, unknown>): VideoInfo {
    const videoId = String(videoData.id);
    const topic = videoData.topicTitle as string | undefined;
    const videoUrlArr = videoData.videoUrl as Array<{ url?: string }> | undefined;
    return {
      _type: 'url_transparent',
      url: `limelight:media:${this._getLimelightMediaId(videoUrlArr?.[0]?.url || '')}`,
      id: videoId,
      title: videoData.headline as string | undefined,
      description: videoData.summary as string | undefined,
      thumbnail: this._getImageUrl(String((videoData.mediaAsset as Record<string, unknown>)?.imageUrl || '')),
      timestamp: parseIso8601(videoData.date) ?? undefined,
      duration: parse_duration(videoData.runTime) ?? undefined,
      tags: (videoData.tags as string[]) || undefined,
      categories: topic ? [topic] : undefined,
      webpage_url: `http://www.skynewsarabia.com/web/video/${videoId}`,
      ie_key: 'LimelightMedia',
    };
  }
}

export class SkyNewsArabiaIE extends SkyNewsArabiaBaseIE {
  static IE_NAME = 'skynewsarabia:video';
  static _VALID_URL = /https?:\/\/(?:www\.)?skynewsarabia\.com\/web\/video\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = await this._callApi('video', videoId);
    return this._extractVideoInfo(videoData);
  }
}

export class SkyNewsArabiaArticleIE extends SkyNewsArabiaBaseIE {
  static IE_NAME = 'skynewsarabia:article';
  static _VALID_URL = /https?:\/\/(?:www\.)?skynewsarabia\.com\/web\/article\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const articleData = await this._callApi('article', articleId);
    const mediaAsset = articleData.mediaAsset as Record<string, unknown>;
    if (mediaAsset?.type === 'VIDEO') {
      const topic = articleData.topicTitle as string | undefined;
      const videoUrlArr = mediaAsset.videoUrl as Array<{ url?: string }> | undefined;
      return {
        _type: 'url_transparent',
        url: `limelight:media:${this._getLimelightMediaId(videoUrlArr?.[0]?.url || '')}`,
        id: articleId,
        title: articleData.headline as string | undefined,
        description: articleData.summary as string | undefined,
        thumbnail: this._getImageUrl(String(mediaAsset.imageUrl || '')),
        timestamp: parseIso8601(articleData.date) ?? undefined,
        tags: (articleData.tags as string[]) || undefined,
        categories: topic ? [topic] : undefined,
        webpage_url: url,
        ie_key: 'LimelightMedia',
      };
    }
    const entries = ((articleData.inlineItems as Array<Record<string, unknown>>) || [])
      .filter((item) => item.type === 'VIDEO')
      .map((item) => this._extractVideoInfo(item));
    return this.playlist_result(
      entries,
      articleId,
      articleData.headline as string | undefined,
      articleData.summary as string | undefined,
    );
  }
}
