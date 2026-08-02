/** TelewebionIE — ported from yt-dlp telewebion.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601 } from './_helpers';

function fmtUrl(template: string, value: unknown): string | undefined {
  if (value == null || value === '') return undefined;
  return template.replace('%s', String(value));
}

export class TelewebionIE extends InfoExtractor {
  static IE_NAME = 'telewebion';
  static _VALID_URL = /https?:\/\/(?:www\.)?telewebion\.ir\/episode\/(?<id>(?:0x[a-fA-F\d]+|\d+))/;

  protected async _callGraphqlApi(
    operation: string,
    videoId: string,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const varDefs = Object.keys(variables)
      .map((name) => `$${name}: [ID!]`)
      .join(', ');
    const parameters = varDefs ? `(${varDefs})` : '';
    const result = await this._download_json<Record<string, unknown>>(
      'https://graph.telewebion.ir/graphql',
      videoId,
      'Downloading GraphQL JSON metadata',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        data: JSON.stringify({
          operationName: operation,
          query: `query ${operation}${parameters} @cacheControl(maxAge: 60) {${query}\n}\n`,
          variables,
        }),
      },
    );
    if (!result || (result.errors as unknown[])?.length) {
      const message = ((result?.errors as Array<{ message?: string }>) || []).map((e) => e.message).filter(Boolean).join(', ');
      throw new ExtractorError(message || 'Unknown GraphQL API error', { expected: true });
    }
    return (result.data as Record<string, unknown>) || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);
    if (!videoId.startsWith('0x')) videoId = `0x${Number(videoId).toString(16)}`;

    const episodeData = await this._callGraphqlApi(
      'getEpisodeDetail',
      videoId,
      `
            queryEpisode(filter: {EpisodeID: $EpisodeId}, first: 1) {
              title
              program { ProgramID title }
              image
              view_count
              duration
              started_at
              created_at
              channel { ChannelID name descriptor }
              tags { name }
            }`,
      { EpisodeId: videoId },
    );

    const episode = ((episodeData.queryEpisode as unknown[]) || [])[0] as Record<string, unknown>;
    const channelDesc = str_or_none(traverse_obj(episode, ['channel', 'descriptor']));
    let formats: Format[] = [];
    if (channelDesc) {
      const m3u8 = `https://cdna.telewebion.ir/${channelDesc}/episode/${videoId}/playlist.m3u8`;
      formats = (await extractM3u8FormatsAndSubtitles(this, m3u8, videoId, 'hls')).formats;
    }

    const image = str_or_none(episode.image);
    return {
      id: videoId,
      title: str_or_none(episode.title) ?? videoId,
      view_count: int_or_none(episode.view_count) ?? undefined,
      duration: int_or_none(episode.duration) ?? undefined,
      tags: ((episode.tags as Array<{ name?: string }>) || []).map((t) => String(t.name)).filter(Boolean),
      release_timestamp: parseIso8601(episode.started_at) ?? undefined,
      timestamp: parseIso8601(episode.created_at) ?? undefined,
      series: str_or_none(traverse_obj(episode, ['program', 'title'])) ?? undefined,
      series_id: str_or_none(traverse_obj(episode, ['program', 'ProgramID'])) ?? undefined,
      channel: str_or_none(traverse_obj(episode, ['channel', 'name'])) ?? undefined,
      channel_id: str_or_none(traverse_obj(episode, ['channel', 'ChannelID'])) ?? undefined,
      channel_url: fmtUrl('https://telewebion.ir/live/%s', channelDesc),
      thumbnail: fmtUrl('https://static.telewebion.ir/episodeImages/%s/default', image),
      formats,
    };
  }
}
