/**
 * ClubicIE — ported from yt-dlp clubic.py
 * Upstream marks this extractor as broken (_WORKING = False).
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html } from '../../utils';
import { qualityRank } from './_helpers';

export class ClubicIE extends InfoExtractor {
  static IE_NAME = 'clubic';
  static _VALID_URL = /https?:\/\/(?:www\.)?clubic\.com\/video\/(?:[^/]+\/)*video.*-(?<id>[0-9]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const playerUrl = `http://player.m6web.fr/v1/player/clubic/${videoId}.html`;
    const playerPage = await this._download_webpage(playerUrl, videoId);

    const config = this._parse_json<{
      videoInfo: { title: string; description?: string };
      sources: Array<{ streamQuality: string; src: string }>;
      poster?: string;
    }>(this._search_regex(/M6\.Player\.config\s*=\s*(\{.+?\});$/m, playerPage, 'configuration'), videoId)!;

    const videoInfo = config.videoInfo;
    const sources = config.sources;
    const qualityOrder = qualityRank(['sd', 'hq']);

    const formats: Format[] = sources.map((src) => ({
      format_id: src.streamQuality,
      url: src.src,
      quality: qualityOrder(src.streamQuality),
    }));

    return {
      id: videoId,
      title: videoInfo.title,
      formats,
      description: clean_html(videoInfo.description) || undefined,
      thumbnail: config.poster,
    };
  }
}
