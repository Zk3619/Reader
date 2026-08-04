// @ts-nocheck
/** VidlyIE â€?ported from yt-dlp vidly.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { mimetype2ext, traverse_obj, url_or_none } from '../../utils';
import { parseJwplayerData } from './_helpers';

export class VidlyIE extends InfoExtractor {
  static IE_NAME = 'vidly';
  static _VALID_URL =
    /https?:\/\/(?:vid\.ly\/|(?:s\.)?vid\.ly\/embeded\.html\?(?:[^#]+&)?link=)(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const embedScript = await this._download_webpage(
      `https://vid.ly/${videoId}/embed`,
      videoId,
      undefined,
      { headers: { Referer: 'https://vid.ly/' } },
    );
    const player = this._search_json<Record<string, unknown>>(
      /initCallback\(/,
      embedScript,
      'player',
      videoId,
    )!;

    const playerType = String(player.player || '');
    if (playerType.startsWith('jwplayer')) {
      return parseJwplayerData(this, player.config, videoId);
    }
    if (!playerType.startsWith('vidly')) {
      throw new ExtractorError(`Unknown player type ${JSON.stringify(playerType)}`);
    }

    const formats: Format[] = [];
    const ext = mimetype2ext(traverse_obj(player, ['config', 'type']) as string) || undefined;
    for (const [source, fid] of [
      ['source', 'sd'],
      ['source_hd', 'hd'],
    ] as const) {
      const src = url_or_none(traverse_obj(player, ['config', source]));
      if (src) {
        formats.push({
          url: src,
          format_id: `http-${fid}`,
          ext,
        });
      }
    }

    formats.push(
      ...(await this._extract_m3u8_formats(
        `https://d3fenhwk93s16g.cloudfront.net/${videoId}/hls.m3u8`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        undefined,
        'Requesting higher quality m3u8 formats',
        false,
      )),
    );

    return {
      id: videoId,
      title: videoId,
      formats,
    };
  }
}
