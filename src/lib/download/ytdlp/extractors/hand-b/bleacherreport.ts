/**
 * BleacherReport{,CMS}IE — ported from yt-dlp bleacherreport.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import { int_or_none, str_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';
import { AMPIE } from '../hand-a/amp';

export class BleacherReportIE extends InfoExtractor {
  static IE_NAME = 'bleacherreport';
  static _VALID_URL = /https?:\/\/(?:www\.)?bleacherreport\.com\/articles\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const resp = await this._download_json<{ article: Record<string, unknown> }>(
      `http://api.bleacherreport.com/api/v1/articles/${articleId}`,
      articleId,
    );
    const articleData = resp.article;

    const thumbnails: Thumbnail[] = [];
    const primaryPhoto = articleData.primaryPhoto as Record<string, unknown> | undefined;
    if (primaryPhoto?.url) {
      thumbnails.push({
        url: primaryPhoto.url as string,
        width: (primaryPhoto.width as number) ?? null,
        height: (primaryPhoto.height as number) ?? null,
      });
    }

    const author = (articleData.author as Record<string, unknown>) || {};
    const info: VideoInfo = {
      _type: 'url_transparent',
      id: articleId,
      title: (articleData.title as string) || articleId,
      uploader: (author.name as string) || undefined,
      uploader_id: str_or_none(articleData.authorId) || undefined,
      timestamp: parseIso8601(articleData.createdAt) ?? undefined,
      thumbnails,
      comment_count: int_or_none(articleData.commentsCount) ?? undefined,
      view_count: int_or_none(articleData.hitCount) ?? undefined,
    };

    const video = articleData.video as Record<string, unknown> | undefined;
    if (video) {
      const videoType = video.type as string;
      if (videoType === 'cms.bleacherreport.com' || videoType === 'vid.bleacherreport.com') {
        info.url = `http://bleacherreport.com/video_embed?id=${video.id}`;
      } else if (videoType === 'youtube.com') {
        info.url = video.id as string;
      } else if (videoType === 'vine.co') {
        info.url = `https://vine.co/v/${video.id}`;
      } else {
        info.url = `${videoType}${video.id}`;
      }
      return info;
    }

    throw new ExtractorError('no video in the article', { expected: true });
  }
}

export class BleacherReportCMSIE extends AMPIE {
  static IE_NAME = 'bleacherreport:cms';
  static _VALID_URL = /https?:\/\/(?:www\.)?bleacherreport\.com\/video_embed\?id=(?<id>[0-9a-f-]{36}|\d{5})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const info = await this._extract_feed_info(`http://vid.bleacherreport.com/videos/${videoId}.akamai`);
    info.id = videoId;
    return info;
  }
}
