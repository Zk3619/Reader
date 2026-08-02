/**
 * FlickrIE â€?ported from yt-dlp flickr.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { qualityRank } from './_helpers';

const LICENSES: Record<string, string> = {
  '0': 'All Rights Reserved',
  '1': 'Attribution-NonCommercial-ShareAlike',
  '2': 'Attribution-NonCommercial',
  '3': 'Attribution-NonCommercial-NoDerivs',
  '4': 'Attribution',
  '5': 'Attribution-ShareAlike',
  '6': 'Attribution-NoDerivs',
  '7': 'No known copyright restrictions',
  '8': 'United States government work',
  '9': 'Public Domain Dedication (CC0)',
  '10': 'Public Domain Work',
};

export class FlickrIE extends InfoExtractor {
  static IE_NAME = 'flickr';
  static _VALID_URL = /https?:\/\/(?:www\.|secure\.)?flickr\.com\/photos\/[\w\-_@]+\/(?<id>\d+)/;

  static _API_BASE_URL = 'https://api.flickr.com/services/rest?';

  protected async _callApi(
    method: string,
    videoId: string,
    apiKey: string,
    note: string,
    secret?: string,
  ): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({
      photo_id: videoId,
      method: `flickr.${method}`,
      api_key: apiKey,
      format: 'json',
      nojsoncallback: '1',
    });
    if (secret) query.set('secret', secret);
    const data = await this._download_json<{ stat?: string; message?: string } & Record<string, unknown>>(
      `${FlickrIE._API_BASE_URL}${query.toString()}`,
      videoId,
      note,
    );
    if (data.stat !== 'ok') throw new ExtractorError(String(data.message || 'API error'));
    return data;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const apiKey = (
      await this._download_json<{ site_key?: string }>(
        'https://www.flickr.com/hermes_error_beacon.gne',
        videoId,
        'Downloading api key',
      )
    ).site_key!;

    const videoInfo = (await this._callApi('photos.getInfo', videoId, apiKey, 'Downloading video info'))
      .photo as Record<string, unknown>;
    if (videoInfo.media !== 'video') throw new ExtractorError('not a video', { expected: true });

    const streams = (
      await this._callApi(
        'video.getStreamInfo',
        videoId,
        apiKey,
        'Downloading streams info',
        String((videoInfo.secret as string | undefined) ?? ''),
      )
    ).streams as Record<string, unknown>;
    const preference = qualityRank([
      '288p',
      'iphone_wifi',
      '100',
      '300',
      '700',
      '360p',
      'appletv',
      '720p',
      '1080p',
      'orig',
    ]);

    const formats: Format[] = [];
    for (const stream of (streams.stream as Record<string, unknown>[]) || []) {
      const streamType = String(stream.type ?? '');
      formats.push({
        format_id: streamType,
        url: String((stream as Record<string, unknown>)._content ?? stream.url ?? ''),
        quality: preference(streamType),
      });
    }

    const owner = (videoInfo.owner as Record<string, unknown>) || {};
    const uploaderId = owner.nsid as string | undefined;
    const uploaderPath = (owner.path_alias as string | undefined) || uploaderId;
    const uploaderUrl = uploaderPath ? `https://www.flickr.com/photos/${uploaderPath}/` : undefined;
    const titleObj = videoInfo.title as Record<string, unknown> | undefined;
    const descObj = videoInfo.description as Record<string, unknown> | undefined;
    const videoMeta = (videoInfo.video as Record<string, unknown>) || {};
    const tagsObj = (videoInfo.tags as Record<string, unknown>) || {};

    return {
      id: videoId,
      title: String(titleObj?._content ?? videoId),
      description: descObj?._content as string | undefined,
      formats,
      timestamp: int_or_none(videoInfo.dateuploaded) ?? undefined,
      duration: int_or_none(videoMeta.duration) ?? undefined,
      uploader_id: uploaderId,
      uploader: owner.realname as string | undefined,
      uploader_url: uploaderUrl,
      comment_count: int_or_none((videoInfo.comments as Record<string, unknown>)?._content) ?? undefined,
      view_count: int_or_none(videoInfo.views) ?? undefined,
      tags: ((tagsObj.tag as Record<string, unknown>[]) || []).map((t) => t._content as string),
      license: LICENSES[String(videoInfo.license ?? '')],
    };
  }
}
