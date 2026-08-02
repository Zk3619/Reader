/** PodbayFMIE / PodbayFMChannelIE — ported from yt-dlp podbayfm.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, url_or_none } from '../../utils';
import { jwtDecodePayload, searchNextjsData } from './_helpers';

function resultFromProps(props: Record<string, unknown>): VideoInfo {
  const image = props.image;
  let thumbnail: string | undefined;
  if (typeof image === 'string') {
    const payload = jwtDecodePayload(image);
    thumbnail = url_or_none(payload.url) ?? undefined;
  }
  return {
    id: str_or_none(props._id) || 'unknown',
    title: str_or_none(props.title) ?? undefined,
    url: url_or_none(props.mediaURL) ?? undefined,
    description: clean_html(str_or_none(props.description)) ?? undefined,
    thumbnail,
    timestamp: int_or_none(props.timestamp) ?? undefined,
    duration: int_or_none(props.duration) ?? undefined,
    ext: 'mp3',
    vcodec: 'none',
  };
}

export class PodbayFMIE extends InfoExtractor {
  static IE_NAME = 'podbayfm';
  static _VALID_URL = /https?:\/\/podbay\.fm\/p\/[^/?#]+\/e\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const episodeId = this._match_id(url);
    const webpage = await this._download_webpage(url, episodeId);
    const data = searchNextjsData(this, webpage, episodeId);
    const episode = ((data.pageProps as Record<string, unknown>)?.episode as Record<string, unknown>) || {};
    return resultFromProps(episode);
  }
}

export class PodbayFMChannelIE extends InfoExtractor {
  static IE_NAME = 'podbayfm:channel';
  static _VALID_URL = /https?:\/\/podbay\.fm\/p\/(?<id>[^/?#]+)\/?(?:$|[?#])/;
  static _PAGE_SIZE = 10;

  protected async _fetchPage(channelId: string, pagenum: number): Promise<Record<string, unknown>> {
    return (
      (
        await this._download_json<{ podcast?: Record<string, unknown> }>(
          `https://podbay.fm/api/podcast?reverse=true&page=${pagenum}&slug=${channelId}`,
          channelId,
          `Downloading channel JSON page ${pagenum + 1}`,
        )
      ).podcast || {}
    );
  }

  protected _resultsFromPage(channelId: string, page: Record<string, unknown>): VideoInfo[] {
    return ((page.episodes as Array<Record<string, unknown>>) || []).map((e) => ({
      ...resultFromProps(e),
      _type: 'url' as const,
      ie_key: 'PodbayFM',
      webpage_url: `https://podbay.fm/p/${channelId}/e/${e.timestamp}`,
      url: `https://podbay.fm/p/${channelId}/e/${e.timestamp}`,
    }));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const firstPage = await this._fetchPage(channelId, 0);
    const entries: VideoInfo[] = [...this._resultsFromPage(channelId, firstPage)];

    for (let page = 1; (firstPage.episodes as unknown[])?.length === PodbayFMChannelIE._PAGE_SIZE; page++) {
      const pageData = await this._fetchPage(channelId, page);
      const batch = this._resultsFromPage(channelId, pageData);
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < PodbayFMChannelIE._PAGE_SIZE) break;
    }

    return this.playlist_result(entries, channelId, firstPage.title as string | undefined);
  }
}
