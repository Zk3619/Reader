/**
 * GBNewsIE — ported from yt-dlp gbnews.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extract_attributes, traverse_obj, url_or_none } from '../../utils';

export class GBNewsIE extends InfoExtractor {
  static IE_DESC = 'GB News clips, features and live streams';
  static IE_NAME = 'gbnews';
  static _VALID_URL = /https?:\/\/(?:www\.)?gbnews\.(?:uk|com)\/(?:\w+\/)?(?<id>[^#?]+)/;

  protected _PLATFORM = 'safari';
  protected _SSMP_URL = 'https://mm-v2.simplestream.com/ssmp/api.php';
  protected _SS_ENDPOINTS: Record<string, string> | null = null;

  protected async _getSsEndpoint(dataId?: string, dataEnv?: string): Promise<string> {
    if (!this._SS_ENDPOINTS) this._SS_ENDPOINTS = {};
    const id = dataId || 'GB003';
    const env = dataEnv || 'production';
    const key = `${id}:${env}`;
    const cached = this._SS_ENDPOINTS[key];
    if (cached) return cached;

    const jsonData = await this._download_json<Record<string, unknown>>(this._SSMP_URL, undefined, undefined, {
      query: { id, env },
    });
    const metaUrl = url_or_none(traverse_obj(jsonData, ['response', 'api_hostname']));
    if (!metaUrl) throw new ExtractorError('No API host found');
    this._SS_ENDPOINTS[key] = metaUrl;
    return metaUrl;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url).split('/').pop() || this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    let videoData: Record<string, string> | undefined;
    for (const htmlTag of webpage.match(/<[^>]*class="[^"]*simplestream[^"]*"[^>]*>/g) || []) {
      const attributes = extract_attributes(htmlTag);
      if (!(attributes.class || '').includes('sidebar')) {
        videoData = attributes;
        break;
      }
    }
    if (!videoData) throw new ExtractorError('Could not find video element', { expected: true });

    const endpointUrl = await this._getSsEndpoint(videoData['data-id'], videoData['data-env']);
    const uvid = videoData['data-uvid']!;
    let videoType = videoData['data-type'];
    if (!videoType || videoType === 'vod') videoType = 'show';

    const streamData = await this._download_json<Record<string, unknown>>(
      `${endpointUrl}/api/${videoType}/stream/${uvid}`,
      uvid,
      'Downloading stream JSON',
      { query: { key: videoData['data-key'], platform: this._PLATFORM } },
    );
    if (traverse_obj(streamData, ['drm'])) this.report_warning(`DRM protected: ${uvid}`);

    return {
      id: uvid,
      display_id: displayId,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      formats: await this._extract_m3u8_formats(
        traverse_obj(streamData, ['response', 'stream']) as string,
        uvid,
        'mp4',
      ),
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      is_live: videoType === 'live',
    };
  }
}
