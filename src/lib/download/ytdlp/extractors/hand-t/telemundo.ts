/** TelemundoIE — ported from yt-dlp telemundo.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { try_get, unified_timestamp } from '../../utils';
import { searchNextjsData } from './_helpers';

export class TelemundoIE extends InfoExtractor {
  static IE_NAME = 'telemundo';
  static _VALID_URL = /https?:\/\/(?:www\.)?telemundo\.com\/.+?video\/[^/]+(?<id>tmvo\d{7})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const metadata = searchNextjsData(this, webpage, videoId);
    const pageProps = (metadata.pageProps as Record<string, unknown>) || {};
    const redirectUrl = try_get(pageProps, (x) => {
      const st = x as { initialState?: { video?: { associatedPlaylists?: Array<{ videos?: Array<{ videoAssets?: Array<{ publicUrl?: string }> }> }> } } };
      return st.initialState?.video?.associatedPlaylists?.[0]?.videos?.[0]?.videoAssets?.[0]?.publicUrl;
    }) as string | undefined;
    if (!redirectUrl) throw new ExtractorError('Unable to extract redirect URL', { expected: true });

    const head = await this._request_webpage(
      `${redirectUrl}?format=redirect&manifest=m3u&format=redirect&Tracking=true&Embedded=true&formats=MPEG4`,
      videoId,
      'Processing m3u8',
    );
    const m3u8Url = head?.url || redirectUrl;
    const formats = await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4');
    const dateRaw = try_get(pageProps, (x) => {
      const st = x as { initialState?: { video?: { associatedPlaylists?: Array<{ videos?: Array<{ datePublished?: string }> }> } } };
      return st.initialState?.video?.associatedPlaylists?.[0]?.videos?.[0]?.datePublished?.split(' ', 2)[1];
    });

    return {
      id: videoId,
      title: this._search_regex(/<h1[^>]+>([^<]+)/, webpage, 'title', null, false) ?? videoId,
      formats,
      timestamp: unified_timestamp(dateRaw) ?? undefined,
      uploader: 'Telemundo',
      uploader_id:
        this._search_regex(/https?:\/\/(?:[^/]+\/){3}video\/(?<id>[^/]+)/, m3u8Url, 'Akamai account', null, false) ??
        undefined,
    };
  }
}
