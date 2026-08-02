/**
 * AudiodraftCustomIE / AudiodraftGenericIE — aligned with yt-dlp audiodraft.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

abstract class AudiodraftBaseIE extends InfoExtractor {
  protected async audiodraftExtractFromId(
    playerEntryId: string,
    extractorKey: string,
  ): Promise<VideoInfo> {
    const dataJson = await this._download_json<Record<string, unknown>>(
      'https://www.audiodraft.com/scripts/general/player/getPlayerInfoNew.php',
      playerEntryId,
      undefined,
      {
        method: 'POST',
        data: `id=${playerEntryId}`,
        headers: {
          'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
      },
    );

    return {
      id: String(dataJson.entry_id),
      title: dataJson.entry_title != null ? String(dataJson.entry_title) : undefined,
      url: String(dataJson.path || ''),
      formats: [{ format_id: 'direct', url: String(dataJson.path || ''), vcodec: 'none', ext: 'mp3' }],
      vcodec: 'none',
      ext: 'mp3',
      uploader: dataJson.designer_name != null ? String(dataJson.designer_name) : undefined,
      uploader_id: dataJson.designer_id != null ? String(dataJson.designer_id) : undefined,
      webpage_url: dataJson.entry_url != null ? String(dataJson.entry_url) : undefined,
      like_count: int_or_none(dataJson.entry_likes) ?? undefined,
      average_rating: int_or_none(dataJson.entry_rating) ?? undefined,
      extractor: extractorKey === 'AudiodraftCustom' ? 'Audiodraft:custom' : 'Audiodraft:generic',
      extractor_key: extractorKey,
    };
  }
}

export class AudiodraftCustomIE extends AudiodraftBaseIE {
  static IE_NAME = 'Audiodraft:custom';
  static _VALID_URL = /https?:\/\/(?:[-\w]+)\.audiodraft\.com\/entry\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const playerEntryId = this._search_regex(
      /playAudio\('(player_entry_\d+)'\);/,
      webpage,
      videoId,
      undefined,
      true,
    )!;
    return this.audiodraftExtractFromId(playerEntryId, 'AudiodraftCustom');
  }
}

export class AudiodraftGenericIE extends AudiodraftBaseIE {
  static IE_NAME = 'Audiodraft:generic';
  static _VALID_URL = /https?:\/\/www\.audiodraft\.com\/contests\/[^/#]+#entries&eid=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.audiodraftExtractFromId(`player_entry_${videoId}`, 'AudiodraftGeneric');
  }
}
