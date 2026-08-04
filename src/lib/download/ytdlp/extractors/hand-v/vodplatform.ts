// @ts-nocheck
/**
 * VODPlatformIE â€?ported from yt-dlp vodplatform.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { unescapeHTML } from '../../utils';
import { extractM3u8FormatsAndSubtitles, hiddenInputs } from './_helpers';

async function extractWowzaFormats(
  ie: InfoExtractor,
  rawUrl: string,
  videoId: string,
  skipProtocols: string[] = [],
): Promise<Format[]> {
  const url = rawUrl.replace(/^rmtp/, 'rtmp').replace(/"\s*\+\s*"/g, '');
  if (/^rtmp/i.test(url)) {
    const m = url.match(/^(?<url>rtmp[s]?:\/\/[^/]+\/(?<app>[^/]+))\/(?<playpath>.+)$/i);
    if (m?.groups) {
      return [
        {
          url,
          format_id: 'rtmp',
          protocol: 'rtmp',
          app: m.groups.app,
          play_path: m.groups.playpath,
        },
      ];
    }
    return [{ url, format_id: 'rtmp', protocol: 'rtmp' }];
  }
  const base = url.replace(/\/(?:manifest|playlist|jwplayer)\.(?:m3u8|f4m|mpd|smil)/, '');
  const httpBase = base.replace(/^rtmp(s)?:/, 'http$1:');
  if (skipProtocols.includes('f4m') && /\.f4m/i.test(httpBase)) return [];
  if (skipProtocols.includes('smil') && /\.smil/i.test(httpBase)) return [];
  return (await extractM3u8FormatsAndSubtitles(ie, `${httpBase}/playlist.m3u8`, videoId, 'hls')).formats;
}

export class VODPlatformIE extends InfoExtractor {
  static IE_NAME = 'vodplatform';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?vod-platform\.net|embed\.kwikmotion\.com)\/[eE]mbed\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = unescapeHTML(this._og_search_title(webpage) || videoId);
    const inputs = hiddenInputs(webpage);
    const streamUrl = inputs.HiddenmyhHlsLink || inputs.HiddenmyDashLink;
    if (!streamUrl) {
      throw new ExtractorError('Unable to extract stream URL', { expected: true });
    }
    const formats = await extractWowzaFormats(this, streamUrl, videoId, ['f4m', 'smil']);

    return {
      id: videoId,
      title,
      thumbnail: inputs.HiddenThumbnail || this._og_search_thumbnail(webpage) || undefined,
      formats,
    };
  }
}
