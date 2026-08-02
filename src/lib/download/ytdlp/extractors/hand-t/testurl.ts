/** TestURLIE — ported from yt-dlp testurl.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { listExtractors } from '../../registry';

type TestCase = { url: string; [key: string]: unknown };

type IEConstructor = typeof InfoExtractor & {
  IE_NAME: string;
  _TESTS?: TestCase[];
};

export class TestURLIE extends InfoExtractor {
  /** upstream: IE_DESC = False (do not list) */
  static IE_NAME = 'testurl';
  static _VALID_URL = /test(?:url)?:(?<extractor>.*?)(?:_(?<num>\d+|all))?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const extractorId = m.groups!.extractor || '';
    const num = m.groups!.num;

    if (!extractorId) {
      return { id: ':test', title: '', url };
    }

    const rex = new RegExp(extractorId, 'i');
    const matching = listExtractors().filter((e) => rex.test(e.ie_name));

    if (matching.length === 0) {
      throw new ExtractorError(`No extractors matching ${JSON.stringify(extractorId)} found`, {
        expected: true,
      });
    }
    let entry = matching[0]!;
    if (matching.length > 1) {
      const exact =
        matching.find((e) => e.ie_name.toLowerCase() === extractorId.toLowerCase()) ||
        matching.find((e) => e.ie_name.split('+')[0]!.toLowerCase() === extractorId.toLowerCase());
      if (!exact) {
        throw new ExtractorError(
          `Found multiple matching extractors: ${matching.map((e) => e.ie_name).join(' ')}`,
          { expected: true },
        );
      }
      entry = exact;
    }

    const IE = entry.create().constructor as IEConstructor;
    const testcases = IE._TESTS;
    if (!testcases?.length) {
      throw new ExtractorError(`No test cases on ${IE.IE_NAME}`, { expected: true });
    }

    if (num === 'all') {
      return this.playlist_result(
        testcases.map((tc) => this.url_result(tc.url, entry.ie_key)),
        url,
        `${IE.IE_NAME} tests`,
      );
    }

    const idx = parseInt(num || '0', 10);
    const tc = testcases[idx];
    if (!tc) {
      throw new ExtractorError(
        `Test case ${num || 0} not found, got only ${testcases.length} tests`,
        { expected: true },
      );
    }

    this.to_screen(`Test URL: ${tc.url}`);
    return this.url_result(tc.url, entry.ie_key);
  }
}
