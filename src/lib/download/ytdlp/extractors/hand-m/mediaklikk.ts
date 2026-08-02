/** MediaKlikkIE — ported from yt-dlp mediaklikk.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_strdate, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class MediaKlikkIE extends InfoExtractor {
  static IE_NAME = 'mediaklikk';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:mediaklikk|m4sport|hirado)\.hu\/.*?(?:videok?|cikk)\/(?:(?<year>[0-9]{4})\/(?<month>[0-9]{1,2})\/(?<day>[0-9]{1,2})\/)?(?<id>[^/#?_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const displayId = mobj.groups!.id!;
    const webpage = await this._download_webpage(url, displayId);
    const playerData =
      this._search_json<Record<string, unknown>>(/loadPlayer\((?:\s*["'][^"']+["']\s*,)?/, webpage, 'player data', displayId, {
        fatal: false,
      }) || {};
    const videoId = String(playerData.contentId ?? displayId);
    const title =
      String(playerData.title || '') ||
      this._og_search_title(webpage, false) ||
      this._html_search_regex(/<h\d+\b[^>]+\bclass="article_title">([^<]+)</, webpage, 'title', null, false) ||
      displayId;

    let uploadDate = unified_strdate(`${mobj.groups!.year}-${mobj.groups!.month}-${mobj.groups!.day}`);
    if (!uploadDate) {
      uploadDate = unified_strdate(
        this._html_search_regex(/<p+\b[^>]+\bclass="article_date">([^<]+)</, webpage, 'upload date', null, false),
      );
    }

    const playerQuery: Record<string, string> = {};
    for (const [k, v] of Object.entries(playerData)) {
      if (k === 'token') {
        playerQuery.video = decodeURIComponent(String(v));
      } else if (v != null) {
        playerQuery[k] = String(v);
      }
    }

    const playerPage = await this._download_webpage('https://player.mediaklikk.hu/playernew/player.php', videoId, undefined, {
      query: playerQuery,
      headers: { Referer: url },
    });
    const playerJson =
      this._search_json<Record<string, unknown>>(/\bpl\.setup\s*\(/, playerPage, 'player json', videoId, {
        fatal: false,
      }) || {};
    const playlist = (playerJson.playlist as Array<Record<string, unknown>>) || [];
    const playlistUrl = url_or_none(playlist.find((p) => p.type === 'hls')?.file);
    if (!playlistUrl) throw new ExtractorError('Unable to extract playlist url');

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, playlistUrl, videoId);

    return {
      id: videoId,
      title,
      display_id: displayId,
      formats,
      subtitles,
      upload_date: uploadDate ?? undefined,
      thumbnail: url_or_none(playerData.bgImage) || this._og_search_thumbnail(webpage) || undefined,
    };
  }
}
