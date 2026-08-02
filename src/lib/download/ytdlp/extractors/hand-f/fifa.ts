/**
 * FifaIE ??ported from yt-dlp fifa.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj, unified_timestamp } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class FifaIE extends InfoExtractor {
  static IE_NAME = 'fifa';
  static _VALID_URL = /https?:\/\/www\.fifa\.com\/fifaplus\/\w{2}\/watch\/([^#?]+\/)?(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const preconnectLink = this._search_regex(
      /<link\b[^>]+\brel\s*=\s*"preconnect"[^>]+href\s*=\s*"([^"]+)"/,
      webpage,
      'Preconnect Link',
    );

    const videoDetails = await this._download_json<Record<string, unknown>>(
      `${preconnectLink}/sections/videoDetails/${videoId}`,
      videoId,
      'Downloading Video Details',
      { fatal: false },
    );

    const preplayParameters = (
      await this._download_json<{ preplayParameters?: Record<string, string> }>(
        `${preconnectLink}/videoPlayerData/${videoId}`,
        videoId,
        'Downloading Preplay Parameters',
      )
    ).preplayParameters!;

    const contentUrl = `https://content.uplynk.com/preplay/${preplayParameters.contentId}/multiple.json?${preplayParameters.queryStr}&sig=${preplayParameters.signature}`;
    const contentData = await this._download_json<{ playURL?: string }>(contentUrl, videoId, 'Downloading Content Data');
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      contentData.playURL || '',
      videoId,
    );

    return {
      id: videoId,
      title: videoDetails.title as string | undefined,
      description: videoDetails.description as string | undefined,
      duration: int_or_none(videoDetails.duration) ?? undefined,
      release_timestamp: unified_timestamp(videoDetails.dateOfRelease) ?? undefined,
      categories: traverse_obj(videoDetails, ['videoCategory', 'videoSubcategory']) as string[] | undefined,
      thumbnail: traverse_obj(videoDetails, ['backgroundImage', 'src']) as string | undefined,
      formats,
      subtitles,
    };
  }
}
