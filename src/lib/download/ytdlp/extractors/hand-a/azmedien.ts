/**
 * AZMedienIE — aligned with yt-dlp azmedien.py (delegates to Kaltura)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';

export class AZMedienIE extends InfoExtractor {
  static IE_NAME = 'azmedien';
  static IE_DESC = 'AZ Medien videos';
  static _VALID_URL =
    /https?:\/\/(?:www\.|tv\.)?(?:telezueri\.ch|telebaern\.tv|telem1\.ch|tvo-online\.ch)\/[^/?#]+\/(?<id>[^/?#]+-\d+)(?:#video=(?<kaltura_id>[_0-9a-z]+))?/i;

  private static PARTNER_ID = '1719221';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups?.id ?? m[1] ?? '';
    let entryId = m.groups?.kaltura_id ?? m[2];

    if (!entryId) {
      const webpage = await this._download_webpage(url, displayId);
      const data = this._search_json<Record<string, unknown>>(
        /window\.__APOLLO_STATE__\s*=/,
        webpage,
        'video data',
        displayId,
      );
      for (const val of Object.values(data || {})) {
        if (val && typeof val === 'object' && (val as Record<string, unknown>).__typename === 'KalturaData') {
          entryId = String((val as Record<string, unknown>).kalturaId || '');
          if (entryId) break;
        }
      }
    }

    if (!entryId) throw new ExtractorError('Unable to extract kaltura id', { expected: true });
    return this.url_result(`kaltura:${AZMedienIE.PARTNER_ID}:${entryId}`, 'Kaltura', String(entryId));
  }
}
