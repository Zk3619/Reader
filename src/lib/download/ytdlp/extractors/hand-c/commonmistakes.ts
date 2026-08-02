/**
 * CommonMistakesIE / UnicodeBOMIE / BlobIE — ported from yt-dlp commonmistakes.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class CommonMistakesIE extends InfoExtractor {
  static IE_NAME = 'commonmistakes';
  /** upstream: IE_DESC = False (do not list) */
  static _VALID_URL = /(?:url|URL|yt-dlp)$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let msg =
      `You've asked yt-dlp to download the URL "${url}". ` +
      "That doesn't make any sense. " +
      'Simply remove the parameter in your command or configuration.';
    if (!this.params.verbose) {
      msg += ' Add -v to the command line to see what arguments and configuration yt-dlp has';
    }
    throw new ExtractorError(msg, { expected: true });
  }
}

export class UnicodeBOMIE extends InfoExtractor {
  static IE_NAME = 'unicodebom';
  static _VALID_URL = /(?<bom>\ufeff)(?<id>.*)$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const realUrl = this._match_id(url);
    this.report_warning(
      'Your URL starts with a Byte Order Mark (BOM). ' + `Removing the BOM and looking for "${realUrl}" ...`,
    );
    return this.url_result(realUrl);
  }
}

export class BlobIE extends InfoExtractor {
  static IE_NAME = 'blob';
  static _VALID_URL = /blob:/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError(
      "You've asked yt-dlp to download a blob URL. " +
        'A blob URL exists only locally in your browser. ' +
        'It is not possible for yt-dlp to access it.',
      { expected: true },
    );
  }
}
