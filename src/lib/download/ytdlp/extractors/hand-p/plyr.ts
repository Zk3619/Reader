/** PlyrEmbedIE — ported from yt-dlp plyr.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { smuggle_url } from '../../utils';

export class PlyrEmbedIE extends InfoExtractor {
  static IE_NAME = 'plyrembed';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new Error('PlyrEmbedIE is embed-only');
  }

  static _extractEmbedUrls(url: string, webpage: string): string[] {
    const out: string[] = [];
    const re =
      /<div[^>]+(?:data-plyr-embed-id="(?<id1>[^"]+)"[^>]+data-plyr-provider="(?<provider1>[^"]+)"|data-plyr-provider="(?<provider2>[^"]+)"[^>]+data-plyr-embed-id="(?<id2>[^"]+)")[^>]*>/gi;
    for (const m of webpage.matchAll(re)) {
      const embedId = m.groups?.id1 || m.groups?.id2 || '';
      const provider = m.groups?.provider1 || m.groups?.provider2 || '';
      if (provider === 'vimeo') {
        const vimeoUrl = /^https?:\/\//.test(embedId)
          ? embedId
          : `https://player.vimeo.com/video/${embedId}`;
        out.push(smuggle_url(vimeoUrl, { referer: url }));
      } else if (provider === 'youtube') {
        out.push(/^https?:\/\//.test(embedId) ? embedId : `https://youtube.com/watch?v=${embedId}`);
      }
    }
    return out;
  }
}
