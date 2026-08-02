/** SaitosanIE — ported from yt-dlp saitosan.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

async function socketJson(ie: InfoExtractor, base: string, bId: string, note: string): Promise<Record<string, unknown>> {
  const text = await ie._download_webpage(base, bId, note);
  const jsonStart = text.indexOf('{');
  if (jsonStart < 0) return {};
  try {
    return JSON.parse(text.slice(jsonStart)) as Record<string, unknown>;
  } catch {
    const m = /\d+:(\[.+?\])/.exec(text);
    return m ? (JSON.parse(m[1]!) as Record<string, unknown>[])[1] as Record<string, unknown> : {};
  }
}

export class SaitosanIE extends InfoExtractor {
  static IE_NAME = 'Saitosan';
  static _VALID_URL = /https?:\/\/(?:www\.)?saitosan\.net\/bview\.html\?id=(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const bId = this._match_id(url);
    let base = 'http://hankachi.saitosan-api.net:8002/socket.io/?transport=polling&EIO=3';
    const open = await socketJson(this, base, bId, 'Opening socket');
    const sid = open.sid as string;
    base += `&sid=${sid}`;

    await this._download_webpage(base, bId, 'Polling socket');
    const payload = `420["room_start_join",{"room_id":"${bId}"}]`;
    await this._download_webpage(base, bId, 'Polling socket with payload', {
      method: 'POST',
      data: `${payload.length}:${payload}`,
    });
    const response = await socketJson(this, base, bId, 'Polling socket');
    if (!response.ok) {
      const err = (response.error as Record<string, unknown>) || {};
      throw new ExtractorError(
        err.code != null
          ? `${this.IE_NAME} said: ${err.code} - ${err.msg || 'Unknown'}`
          : "The socket reported that the broadcast could not be joined. Maybe it's offline or the URL is incorrect",
        { expected: true },
      );
    }

    await this._download_webpage(base, bId, 'Polling socket', {
      method: 'POST',
      data: '26:421["room_finish_join",{}]',
    });
    const bData = await socketJson(this, base, bId, 'Getting broadcast metadata from socket');
    const m3u8Url = bData.url as string;
    await this._download_webpage(base, bId, 'Closing socket', { method: 'POST', data: '1:1', fatal: false });

    const { formats } = await extractM3u8FormatsAndSubtitles(this, m3u8Url, bId, 'hls');
    const broadcastUser = bData.broadcast_user as Record<string, unknown> | undefined;

    return {
      id: bId,
      title: bData.name as string | undefined,
      formats,
      thumbnail: m3u8Url.replace('av.m3u8', 'thumb'),
      uploader: broadcastUser?.name as string | undefined,
      is_live: true,
    };
  }
}
