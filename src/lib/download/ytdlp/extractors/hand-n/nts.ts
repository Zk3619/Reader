/** NTSLiveIE — ported from yt-dlp nts.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { str_or_none, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class NTSLiveIE extends InfoExtractor {
  static IE_NAME = 'nts.live';
  static _VALID_URL = /https?:\/\/(?:www\.)?nts\.live\/shows\/[^/?#]+\/episodes\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const data = this._search_json<Record<string, unknown>>(
      /window\._REACT_STATE_\s*=/,
      webpage,
      'react state',
      videoId,
    )!;
    const episode = (data.episode as Record<string, unknown>) || {};
    const embedUrl = str_or_none(
      (episode.audio_sources as Array<{ url?: string }>)?.find((s) => s.url)?.url,
    );

    return {
      _type: 'url_transparent',
      id: videoId,
      url: url_or_none(embedUrl) || url,
      title: str_or_none(episode.name) ?? undefined,
      description: str_or_none(episode.description) ?? undefined,
      genres: ((episode.genres as Array<{ value?: string }>) || [])
        .map((g) => str_or_none(g.value))
        .filter(Boolean) as string[],
      timestamp: parseIso8601(episode.broadcast) ?? undefined,
      modified_timestamp: parseIso8601(episode.updated) ?? undefined,
    };
  }
}
