// @ts-nocheck
/**
 * VocarooIE â€?ported from yt-dlp vocaroo.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none } from '../../utils';

export class VocarooIE extends InfoExtractor {
  static IE_NAME = 'vocaroo';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:vocaroo\.com|voca\.ro)\/(?:embed\/)?(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const mediaSubdomain =
      audioId.length === 10 || (audioId.length === 12 && audioId[0] === '1') ? 'media1' : 'media';

    const mediaUrl = `https://${mediaSubdomain}.vocaroo.com/mp3/${audioId}`;
    const httpHeaders = { Referer: 'https://vocaroo.com/' };

    // HEAD-like probe â€?response header timestamp may be unavailable via _request_webpage
    const resp = await this._request_webpage(
      { url: mediaUrl, headers: httpHeaders },
      audioId,
      undefined,
      { fatal: false, headers: httpHeaders },
    );

    const tsHeader =
      resp?.headers?.['x-bz-upload-timestamp'] ||
      resp?.headers?.['X-Bz-Upload-Timestamp'];

    return {
      id: audioId,
      title: '',
      url: mediaUrl,
      ext: 'mp3',
      timestamp: float_or_none(tsHeader, 1000) ?? undefined,
      vcodec: 'none',
      http_headers: httpHeaders,
    };
  }
}
