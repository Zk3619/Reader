/** RadLive* — ported from yt-dlp radlive.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj, unified_timestamp } from '../../utils';
import { format_field } from './_helpers';

function parseInitialContent(webpage: string): Record<string, unknown> {
  const jsonRaw = webpage.match(
    /<script[^>]*type=(['"])application\/json\1[^>]*>(?<json>\{[\s\S]+?\})<\/script>/,
  )?.groups?.json;
  if (!jsonRaw) throw new ExtractorError('Unable to extract JSON');
  const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
  return traverse_obj(parsed, ['props', 'pageProps', 'initialContentData']) as Record<string, unknown>;
}

export class RadLiveIE extends InfoExtractor {
  static IE_NAME = 'radlive';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rad\.live\/content\/(?<content_type>feature|episode)\/(?<id>[a-f0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const contentType = m.groups!.content_type!;
    const videoId = m.groups!.id!;
    const webpage = await this._download_webpage(url, videoId);
    const contentInfo = parseInitialContent(webpage);
    const videoInfo = contentInfo[contentType] as Record<string, unknown> | undefined;
    if (!videoInfo) throw new ExtractorError('Unable to extract video info, make sure the URL is valid');

    const assets = (videoInfo.assets as Record<string, unknown>) || {};
    const videos = (assets.videos as Array<Record<string, unknown>>) || [];
    const m3u8Url = videos[0]?.url as string;
    const formats = m3u8Url ? await this._extract_m3u8_formats(m3u8Url, videoId) : [];

    const data = (videoInfo.structured_data as Record<string, unknown>) || {};
    const releaseDate = unified_timestamp(traverse_obj(data, ['releasedEvent', 'startDate']) as string);
    const channel = ((contentInfo.channels as Array<Record<string, unknown>>) || [])[0] || {};
    const channelLrn = String(channel.lrn || '');
    const channelId = channelLrn.split(':').pop() || undefined;

    const result: VideoInfo = {
      id: videoId,
      title: videoInfo.title as string,
      formats,
      language: traverse_obj(data, ['potentialAction', 'target', 'inLanguage']) as string | undefined,
      thumbnail: traverse_obj(data, ['image', 'contentUrl']) as string | undefined,
      description: data.description as string | undefined,
      release_timestamp: releaseDate ?? undefined,
      channel: channel.name as string | undefined,
      channel_id: channelId,
      channel_url: format_field({ id: channelId }, 'id', 'https://rad.live/content/channel/%s') ?? undefined,
    };

    if (contentType === 'episode') {
      result.episode = videoInfo.title as string | undefined;
      result.episode_number = videoInfo.number as number | undefined;
      result.episode_id = String(videoInfo.id ?? '');
    }
    return result;
  }
}

export class RadLiveSeasonIE extends InfoExtractor {
  static IE_NAME = 'radlive:season';
  static _VALID_URL = /https?:\/\/(?:www\.)?rad\.live\/content\/season\/(?<id>[a-f0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const seasonId = this._match_id(url);
    const webpage = await this._download_webpage(url, seasonId);
    const contentInfo = parseInitialContent(webpage);
    const videoInfo = contentInfo.season as Record<string, unknown>;
    const entries = ((videoInfo.episodes as Array<Record<string, unknown>>) || []).map((episode) => {
      const sd = episode.structured_data as Record<string, unknown>;
      const epUrl = String(sd.url || '');
      return {
        _type: 'url_transparent' as const,
        id: epUrl.split('/').pop() || seasonId,
        url: epUrl,
        series: traverse_obj(contentInfo, ['series', 'title']) as string | undefined,
        season: videoInfo.title as string | undefined,
        season_number: videoInfo.number as number | undefined,
        season_id: String(videoInfo.id ?? ''),
        ie_key: 'RadLive',
      };
    });
    return this.playlist_result(entries, seasonId, videoInfo.title as string | undefined);
  }
}

export class RadLiveChannelIE extends InfoExtractor {
  static IE_NAME = 'radlive:channel';
  static _VALID_URL = /https?:\/\/(?:www\.)?rad\.live\/content\/channel\/(?<id>[a-f0-9-]+)/;
  static _QUERY = `
query WebChannelListing ($lrn: ID!) {
  channel (id:$lrn) {
    name
    features {
      structured_data
    }
  }
}`;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const graphql = await this._download_json<Record<string, unknown>>(
      'https://content.mhq.12core.net/graphql',
      channelId,
      undefined,
      {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({
          query: RadLiveChannelIE._QUERY,
          variables: { lrn: `lrn:12core:media:content:channel:${channelId}` },
        }),
      },
    );
    const data = traverse_obj(graphql, ['data', 'channel']) as Record<string, unknown> | undefined;
    if (!data) throw new ExtractorError('Unable to extract video info, make sure the URL is valid');

    const entries = ((data.features as Array<Record<string, unknown>>) || []).map((feature) => {
      const featureUrl = (feature.structured_data as Record<string, unknown>).url as string;
      return {
        _type: 'url_transparent' as const,
        id: featureUrl.split('/').pop() || channelId,
        url: featureUrl,
        ie_key: 'RadLive',
      };
    });
    return this.playlist_result(entries, channelId, data.name as string | undefined);
  }
}
