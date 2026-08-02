/**
 * DRBonanzaIE — ported from yt-dlp drbonanza.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { js_to_json, parse_duration, unescapeHTML } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class DRBonanzaIE extends InfoExtractor {
  static IE_NAME = 'drbonanza';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?dr\.dk\/bonanza\/[^/]+\/\d+\/[^/]+\/(?<id>\d+)\/(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;
    const webpage = await this._download_webpage(url, displayId);

    const mediaEntries = await parseHtml5MediaEntries(this, url, webpage, displayId, { m3u8Id: 'hls' });
    const info: VideoInfo = {
      id: videoId,
      display_id: displayId,
      formats: mediaEntries[0]?.formats || [],
      subtitles: mediaEntries[0]?.subtitles,
    };

    const asset = this._parse_json<Record<string, unknown>>(
      this._search_regex(/currentAsset\s*=\s*({[\s\S]+?})\s*<\/script/, webpage, 'asset')!,
      displayId,
      js_to_json,
    )!;
    const title = unescapeHTML(String(asset.AssetTitle ?? '')).trim();

    const extractField = (field: string): string | null =>
      this._search_regex(
        new RegExp(`<div[^>]+>\\s*<p>${field}:<p>\\s*</div>\\s*<div[^>]+>\\s*<p>([^<]+)</p>`, 'i'),
        webpage,
        field,
        null,
        false,
      );

    return {
      ...info,
      id: String(asset.AssetId ?? videoId),
      display_id: displayId,
      title,
      description: extractField('Programinfo') ?? undefined,
      duration: parse_duration(extractField('Tid')) ?? undefined,
      thumbnail: (asset.AssetImageUrl as string) ?? undefined,
    };
  }
}
