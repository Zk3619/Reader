/**
 * CrooksAndLiarsIE — ported from yt-dlp crooksandliars.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { qualityRank } from './_helpers';

export class CrooksAndLiarsIE extends InfoExtractor {
  static IE_NAME = 'crooksandliars';
  static _VALID_URL = /https?:\/\/embed\.crooksandliars\.com\/(?:embed|v)\/(?<id>[A-Za-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(`http://embed.crooksandliars.com/embed/${videoId}`, videoId);

    const manifest = this._search_json<{
      title: string;
      description?: string;
      poster?: string;
      created?: number;
      author?: string;
      duration?: number;
      flavors: Array<{ url: string; type: string; mime: string }>;
    }>(/var\s+manifest\s*=/, webpage, 'manifest JSON', videoId)!;

    const quality = qualityRank(['webm_low', 'mp4_low', 'webm_high', 'mp4_high']);

    const formats: Format[] = manifest.flavors
      .filter((item) => item.mime.startsWith('video/'))
      .map((item) => ({ url: item.url, format_id: item.type, quality: quality(item.type) }));

    return {
      url,
      id: videoId,
      title: manifest.title,
      description: manifest.description,
      thumbnail: manifest.poster ? protoRelative(manifest.poster) : undefined,
      timestamp: int_or_none(manifest.created) ?? undefined,
      uploader: manifest.author,
      duration: int_or_none(manifest.duration) ?? undefined,
      formats,
    };
  }
}

function protoRelative(u: string): string {
  return u.startsWith('//') ? `https:${u}` : u;
}
