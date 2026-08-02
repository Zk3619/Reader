/**
 * BilibiliBaseIE — root base of the Bilibili family (aligned with bilibili.py
 * `BilibiliBaseIE`). Never matches a URL directly; concrete IEs live in
 * sibling bilibili-*.ts files and implement their own `_real_extract`.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { VideoInfo } from '../types';

export class BilibiliBaseIE extends InfoExtractor {
  static IE_NAME = 'bilibilibase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('BilibiliBaseIE is a base class and cannot extract directly', {
      expected: true,
    });
  }
}
