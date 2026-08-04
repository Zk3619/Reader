// @ts-nocheck
/** YoutubeClipIE â€?ported from yt-dlp youtube/_clip.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { extractYtInitialData } from '../youtube/shared';

function findLoopCommand(root: unknown): Record<string, unknown> | null {
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item);
        if (hit) return hit;
      }
      return null;
    }
    const obj = node as Record<string, unknown>;
    if (obj.loopCommand && typeof obj.loopCommand === 'object') {
      return obj.loopCommand as Record<string, unknown>;
    }
    for (const val of Object.values(obj)) {
      const hit = visit(val);
      if (hit) return hit;
    }
    return null;
  };
  return visit(root);
}

export class YoutubeClipIE extends InfoExtractor {
  static IE_NAME = 'youtube:clip';
  static _VALID_URL = /https?:\/\/(?:www\.)?youtube\.com\/clip\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const clipId = this._match_id(url);
    const webpage = await this._download_webpage(url, clipId, 'Downloading clip webpage');
    const data = extractYtInitialData(webpage || '');
    if (!data) {
      throw new ExtractorError('Unable to extract ytInitialData from clip page', { expected: true });
    }

    const videoId = traverse_obj(data, ['currentVideoEndpoint', 'watchEndpoint', 'videoId']) as
      | string
      | undefined;
    if (!videoId) {
      throw new ExtractorError('Unable to find video ID', { expected: true });
    }

    const clipData = findLoopCommand(data) || {};
    const startMs = Number(clipData.startTimeMs);
    const endMs = Number(clipData.endTimeMs);

    return {
      _type: 'url_transparent',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      ie_key: 'Youtube',
      id: clipId,
      title: clipId,
      media_type: 'clip',
      section_start: Number.isFinite(startMs) ? startMs / 1000 : undefined,
      section_end: Number.isFinite(endMs) ? endMs / 1000 : undefined,
      extractor: YoutubeClipIE.IE_NAME,
      extractor_key: 'YoutubeClip',
    };
  }
}
