// @ts-nocheck
/** YoutubeTruncatedURLIE / YoutubeTruncatedIDIE â€?ported from yt-dlp youtube/_mistakes.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class YoutubeTruncatedURLIE extends InfoExtractor {
  static IE_NAME = 'youtube:truncated_url';
  static IE_DESC = false as unknown as string;
  static _VALID_URL =
    /(?:https?:\/\/)?(?:\w+\.)?[yY][oO][uU][tT][uU][bB][eE](?:-nocookie)?\.com\/(?:watch\?(?:feature=[a-z_]+|annotation_id=annotation_[^&]+|x-yt-cl=[0-9]+|hl=[^&]*|t=[0-9]+)?|attribution_link\?a=[^&]+)$/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError(
      'Did you forget to quote the URL? Remember that & is a meta ' +
        'character in most shells, so you want to put the URL in quotes, ' +
        'like  yt-dlp ' +
        '"https://www.youtube.com/watch?feature=foo&v=YE7VzlLtp-4" ' +
        ' or simply  yt-dlp YE7VzlLtp-4  .',
      { expected: true },
    );
  }
}

export class YoutubeTruncatedIDIE extends InfoExtractor {
  static IE_NAME = 'youtube:truncated_id';
  static IE_DESC = false as unknown as string;
  static _VALID_URL = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=(?<id>[0-9A-Za-z_-]{1,10})$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    throw new ExtractorError(
      `Incomplete YouTube ID ${videoId}. URL ${url} looks truncated.`,
      { expected: true },
    );
  }
}
