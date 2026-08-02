/**
 * NetAppBaseIE / NetAppVideoIE / NetAppCollectionIE — ported from yt-dlp netapp.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parseIso8601 } from './_helpers';

export class NetAppBaseIE extends InfoExtractor {
  static IE_NAME = 'netappbase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _BC_URL =
    'https://players.brightcove.net/6255154784001/default_default/index.html?videoId={}';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NetAppBaseIE is not a standalone extractor', { expected: true });
  }

  protected _parseMetadata(item: Record<string, unknown>): Partial<VideoInfo> {
    return {
      title: item.name as string | undefined,
      description: item.description as string | undefined,
      timestamp: parseIso8601(item.createdAt) ?? undefined,
    };
  }
}

export class NetAppVideoIE extends NetAppBaseIE {
  static IE_NAME = 'netapp:video';
  static _VALID_URL =
    /https?:\/\/media\.netapp\.com\/video-detail\/(?<id>[0-9a-f-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoUuid = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://api.media.netapp.com/client/detail/${videoUuid}`,
      videoUuid,
    );

    const sections = (metadata.sections as Array<Record<string, unknown>>) || [];
    const playerSection = sections.find((s) => s.type === 'Player');
    const brightcoveVideoId = playerSection?.video != null ? String(playerSection.video) : undefined;
    if (!brightcoveVideoId) throw new ExtractorError('Unable to extract brightcove video id');

    const videoItem = sections.find((s) => s.type === 'VideoDetail') || {};
    return {
      ...this.url_result(this._BC_URL.replace('{}', brightcoveVideoId), 'BrightcoveNew', brightcoveVideoId),
      _type: 'url_transparent',
      ...this._parseMetadata(videoItem),
    } as VideoInfo;
  }
}

export class NetAppCollectionIE extends NetAppBaseIE {
  static IE_NAME = 'netapp:collection';
  static _VALID_URL =
    /https?:\/\/media\.netapp\.com\/collection\/(?<id>[0-9a-f-]+)/;

  protected _entries(metadata: Record<string, unknown>): VideoInfo[] {
    const items = (metadata.items as Array<Record<string, unknown>>) || [];
    return items
      .filter((item) => item.brightcoveVideoId)
      .map((item) => {
        const bcId = String(item.brightcoveVideoId);
        return {
          ...this.url_result(this._BC_URL.replace('{}', bcId), 'BrightcoveNew', bcId),
          _type: 'url_transparent',
          ...this._parseMetadata(item),
        } as VideoInfo;
      });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const collectionUuid = this._match_id(url);
    const metadata = await this._download_json<Record<string, unknown>>(
      `https://api.media.netapp.com/client/collection/${collectionUuid}`,
      collectionUuid,
    );
    return this.playlist_result(this._entries(metadata), collectionUuid, metadata.name as string | undefined);
  }
}
