/** SibnetEmbedIE â€?ported from yt-dlp sibnet.py (embed-only stub) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class SibnetEmbedIE extends InfoExtractor {
  static IE_NAME = 'sibnet:embed';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('SibnetEmbedIE is embed-only', { expected: true });
  }
}
