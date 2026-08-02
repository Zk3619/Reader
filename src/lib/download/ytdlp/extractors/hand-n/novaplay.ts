/** NovaPlayIE — ported from yt-dlp novaplay.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { parseIso8601, searchNextjsData } from './_helpers';

export class NovaPlayIE extends InfoExtractor {
  static IE_NAME = 'NovaPlay';
  static _VALID_URL = /https?:\/\/play\.nova\.bg\/video\/[^?#]+\/(?<id>\d+)/;

  protected static _accessToken: string | null = null;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    if (!NovaPlayIE._accessToken) {
      const client = await this._download_json<{ accessToken?: string }>(
        'https://play.nova.bg/api/client',
        'client',
      );
      NovaPlayIE._accessToken = client.accessToken || null;
    }
    const nextjs = searchNextjsData(this, webpage, videoId);
    const videoProps = (nextjs.pageProps as Record<string, unknown>)?.video as Record<string, unknown>;
    const streams = await this._download_json<Array<{ links?: { play?: { href?: string } } }>>(
      `https://nbg-api.fite.tv/api/v2/videos/${videoId}/streams`,
      videoId,
      undefined,
      {
        headers: {
          'x-flipps-user-agent': 'Flipps/75/9.7',
          'x-flipps-version': '2022-05-17',
          Authorization: `Bearer ${NovaPlayIE._accessToken}`,
        },
      },
    );
    const m3u8Url = streams[0]?.links?.play?.href;
    const formats = m3u8Url
      ? await this._extract_m3u8_formats(m3u8Url, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls')
      : [];

    return {
      id: videoId,
      title: String(videoProps?.title ?? videoId),
      alt_title: videoProps?.slug ? String(videoProps.slug) : undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      description: this._og_search_description(webpage) || undefined,
      formats,
      duration: parse_duration(String(videoProps?.duration ?? '')) ?? undefined,
      timestamp: parseIso8601(videoProps?.published_at) ?? undefined,
      view_count: int_or_none(videoProps?.view_count) ?? undefined,
    };
  }
}
