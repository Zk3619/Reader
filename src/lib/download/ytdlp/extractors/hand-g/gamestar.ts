/**
 * GameStarIE — ported from yt-dlp gamestar.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, remove_end } from '../../utils';

export class GameStarIE extends InfoExtractor {
  static IE_NAME = 'gamestar';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?game(?<site>pro|star)\.de\/videos\/.*,(?<id>[0-9]+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const site = m.groups!.site!;
    const videoId = m.groups!.id!;
    const webpage = await this._download_webpage(url, videoId);

    const jsonLdRaw = this._search_regex(
      /<script[^>]+type=(["'])application\/ld\+json\1[^>]*>(?<json_ld>[\s\S]+?VideoObject[\s\S]+?)<\/script>/,
      webpage,
      'JSON-LD',
      null,
      true,
      'json_ld',
    )!;
    const infoDict = this._search_json_ld(this._parse_json(jsonLdRaw, videoId)!, videoId);
    if (infoDict.title) {
      infoDict.title = remove_end(String(infoDict.title), ` - Game${site[0]!.toUpperCase()}${site.slice(1)}`);
    }

    const viewCount = int_or_none((this._parse_json(jsonLdRaw, videoId) as Record<string, unknown>).interactionCount);
    const commentCount = int_or_none(
      this._search_regex(
        /<span>Kommentare<\/span>\s*<span[^>]+class=["']count[^>]+>\s*\(\s*([0-9]+)/,
        webpage,
        'comment count',
        null,
        false,
        1,
      ),
    );

    return {
      ...infoDict,
      id: videoId,
      url: `http://gamestar.de/_misc/videos/portal/getVideoUrl.cfm?premium=0&videoId=${videoId}`,
      ext: 'mp4',
      view_count: viewCount ?? undefined,
      comment_count: commentCount ?? undefined,
    };
  }
}
