/**
 * HrefLiRedirectIE — ported from yt-dlp hrefli.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class HrefLiRedirectIE extends InfoExtractor {
  static IE_NAME = 'href.li';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = /https?:\/\/href\.li\/\?(?<url>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const target = this._match_valid_url(url)!.groups!.url!;
    return this.url_result(target);
  }
}
