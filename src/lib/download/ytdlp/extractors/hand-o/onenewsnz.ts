/** OneNewsNZIE — ported from yt-dlp onenewsnz.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';
import { htmlExtractTitle } from './_helpers';

const BRIGHTCOVE_URL_TEMPLATE =
  'http://players.brightcove.net/%s/0xpHIR6IB_default/index.html?videoId=%s';

export class OneNewsNZIE extends InfoExtractor {
  static IE_NAME = '1News';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:1|one)news\.co\.nz\/\d+\/\d+\/\d+\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const fusionMetadata = this._search_json<Record<string, unknown>>(
      /Fusion\.globalContent\s*=/,
      webpage,
      'fusion metadata',
      displayId,
    )!;

    const entries: VideoInfo[] = [];
    for (const item of (traverse_obj(fusionMetadata, 'content_elements') as Array<Record<string, unknown>>) || []) {
      const itemType = traverse_obj(item, 'subtype') as string | undefined;
      if (itemType === 'video') {
        const brightcoveConfig = traverse_obj(item, ["embed", "config"]) as Record<string, unknown> | undefined;
        const account = (traverse_obj(brightcoveConfig, 'brightcoveAccount') as string) || '963482464001';
        const bcVideoId = traverse_obj(brightcoveConfig, 'brightcoveVideoId') as string;
        const brightcoveUrl = BRIGHTCOVE_URL_TEMPLATE.replace('%s', account).replace('%s', bcVideoId);
        entries.push(this.url_result(brightcoveUrl, 'BrightcoveNew'));
      } else if (itemType === 'youtube') {
        const videoIdOrUrl =
          (traverse_obj(item, ["referent", "id"]) as string | undefined) ||
          (traverse_obj(item, ["raw_oembed", "_id"]) as string | undefined);
        if (videoIdOrUrl) entries.push(this.url_result(videoIdOrUrl, 'Youtube'));
      }
    }

    if (!entries.length) {
      throw new ExtractorError('This article does not have a video.', { expected: true });
    }

    const playlistTitle =
      (traverse_obj(fusionMetadata, ["headlines", "basic"]) as string | undefined) ||
      htmlExtractTitle(webpage) ||
      undefined;

    return this.playlist_result(entries, displayId, playlistTitle);
  }
}
