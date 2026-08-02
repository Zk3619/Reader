/**
 * ComedyCentralIE — ported from yt-dlp comedycentral.py
 * Upstream extends MTVServicesBaseIE; the non-AdobePass main extraction
 * path is inlined here since MTVServicesBaseIE is not part of this batch.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none, traverse_obj, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

function findByType(node: unknown, type: string): Record<string, unknown> | undefined {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    const obj = cur as Record<string, unknown>;
    if (obj.type === type) return obj;
    if (Array.isArray(obj.children)) stack.push(...obj.children);
  }
  return undefined;
}

export class ComedyCentralIE extends InfoExtractor {
  static IE_NAME = 'comedycentral';
  static _VALID_URL = /https?:\/\/(?:www\.)?cc\.com\/video-clips\/(?<id>[\da-z]{6})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);

    const data = await this._download_json<Record<string, unknown>>(url.split('?')[0]!, displayId, undefined, {
      query: { json: 'true' },
    });

    const mainContainer = findByType(data, 'MainContainer');
    let flexWrapper =
      findByType(mainContainer, 'AviaWrapper') != null
        ? findByType(findByType(mainContainer, 'AviaWrapper'), 'FlexWrapper')
        : findByType(mainContainer, 'FlexWrapper');
    if (!flexWrapper) flexWrapper = findByType(mainContainer, 'FlexWrapper');

    let videoDetail: Record<string, unknown> | undefined;
    const authSuite = findByType(flexWrapper, 'AuthSuiteWrapper');
    const playerNode = findByType(authSuite ?? flexWrapper, 'Player');
    videoDetail = traverse_obj(playerNode, ['props', 'videoDetail']) as Record<string, unknown> | undefined;

    if (!videoDetail) {
      videoDetail = traverse_obj(data, ['children', 0, 'videoDetail']) as Record<string, unknown> | undefined;
    }
    if (!videoDetail) throw new ExtractorError('Unable to extract video detail');

    const mgid = String(videoDetail.mgid || '');
    const videoId = mgid.split(':').pop() || displayId;
    const serviceUrl = url_or_none(videoDetail.videoServiceUrl);
    if (!serviceUrl) throw new ExtractorError('This content is no longer available', { expected: true });

    if (videoDetail.authRequired) {
      this.raise_login_required('This content requires a TV provider login (--ap-mso is not supported)');
    }

    const streamResp = await this._download_json<{ stitchedstream: Record<string, unknown> }>(
      serviceUrl.split('?')[0]!,
      videoId,
      'Downloading API JSON',
      { query: { clientPlatform: 'desktop' } },
    );
    const streamInfo = streamResp.stitchedstream;

    let formats;
    let subtitles: Record<string, Subtitle[]> = {};
    const manifestType = streamInfo.manifesttype;
    if (manifestType === 'hls') {
      formats = await this._extract_m3u8_formats(streamInfo.source as string, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
    } else if (manifestType === 'dash') {
      formats = await this._extract_mpd_formats(streamInfo.source as string, videoId, 'dash');
    } else {
      this.raise_no_formats(`Unsupported manifest type "${manifestType}"`);
      formats = [];
    }

    const thumbnails: Thumbnail[] = ((videoDetail.images as Array<Record<string, unknown>>) || [])
      .map((img) => ({ url: url_or_none(img.url) || '' }))
      .filter((t) => t.url);

    return {
      id: videoId,
      display_id: displayId,
      formats,
      subtitles,
      title: (videoDetail.title as string) || undefined,
      channel: (traverse_obj(videoDetail, ['channel', 'name']) as string) || undefined,
      thumbnails,
      description: (videoDetail.fullDescription as string) || (videoDetail.description as string) || undefined,
      series: (traverse_obj(videoDetail, ['parentEntity', 'title']) as string) || undefined,
      season_number: int_or_none(videoDetail.seasonNumber) ?? undefined,
      episode_number: int_or_none(videoDetail.episodeAiringOrder) ?? undefined,
      duration: float_or_none(traverse_obj(videoDetail, ['duration', 'milliseconds']), 1000) ?? undefined,
      timestamp:
        parseIso8601(videoDetail.originalPublishDate) ??
        int_or_none(traverse_obj(videoDetail, ['publishDate', 'timestamp'])) ??
        undefined,
      release_timestamp:
        parseIso8601(videoDetail.originalAirDate) ??
        int_or_none(traverse_obj(videoDetail, ['airDate', 'timestamp'])) ??
        undefined,
    } as VideoInfo;
  }
}
