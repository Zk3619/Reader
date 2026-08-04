// @ts-nocheck
/** YapFilesIE �?ported from yt-dlp yapfiles.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, url_or_none } from '../../utils';
import { qualities } from './_helpers';

const YAPFILES_URL =
  /\/\/(?:(?:www|api)\.)?yapfiles\.ru\/get_player\/?\?.*?\bv=(?<id>\w+)/;

export class YapFilesIE extends InfoExtractor {
  static IE_NAME = 'YapFiles';
  static _WORKING = false;
  static _VALID_URL = new RegExp(`https?:${YAPFILES_URL.source}`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const webpage = await this._download_webpage(url, videoId, undefined, { fatal: false });

    let playerUrl: string | null = null;
    let query: Record<string, string> = {};
    if (webpage) {
      playerUrl = this._search_regex(
        /player\.init\s*\(\s*(["'])(?<url>(?:(?!\1).)+)\1/,
        webpage,
        'player url',
        null,
        false,
        'url',
      );
    }

    if (!playerUrl) {
      playerUrl = `http://api.yapfiles.ru/load/${videoId}/`;
      query = {
        md5: 'ded5f369be61b8ae5f88e2eeb2f3caff',
        type: 'json',
        ref: url,
      };
    }

    const playerJson = await this._download_json<{ player: Record<string, unknown> }>(
      playerUrl,
      videoId,
      undefined,
      { query },
    );
    const player = playerJson.player || {};

    const playlistUrl = String(player.playlist || '');
    const title = String(player.title || videoId);
    const thumbnail = player.poster != null ? String(player.poster) : undefined;

    if (title === 'Ролик удален' || (thumbnail || '').includes('deleted.jpg')) {
      throw new ExtractorError(`Video ${videoId} has been removed`, { expected: true });
    }

    const playlistJson = await this._download_json<{
      player?: { main?: Record<string, unknown> };
    }>(playlistUrl, videoId);
    const playlist = playlistJson.player?.main || {};

    const hdHeight = int_or_none(player.hd);
    const QUALITIES = ['sd', 'hd'] as const;
    const qualityKey = qualities([...QUALITIES]);
    const formats: Format[] = [];
    for (const formatId of QUALITIES) {
      const isHd = formatId === 'hd';
      const formatUrl = url_or_none(playlist[isHd ? 'file_hd' : 'file']);
      if (!formatUrl) continue;
      formats.push({
        url: formatUrl,
        format_id: formatId,
        quality: qualityKey(formatId),
        height: isHd ? (hdHeight ?? undefined) : undefined,
      });
    }

    return {
      id: videoId,
      title,
      thumbnail,
      duration: int_or_none(player.length) ?? undefined,
      formats,
    };
  }
}
