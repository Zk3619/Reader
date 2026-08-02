/** QingTingIE — ported from yt-dlp qingting.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { traverse_obj } from '../../utils';

export class QingTingIE extends InfoExtractor {
  static IE_NAME = 'qingting';
  static _VALID_URL =
    /https?:\/\/(?:www\.|m\.)?(?:qingting\.fm|qtfm\.cn)\/v?channels\/(?<channel>\d+)\/programs\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channelId = m.groups?.channel ?? '';
    const pid = m.groups?.id ?? '';
    const webpage = await this._download_webpage(
      `https://m.qtfm.cn/vchannels/${channelId}/programs/${pid}/`,
      pid,
    );
    const info = this._search_json<Record<string, unknown>>(/window\.__initStores\s*=/, webpage, 'program info', pid);

    return {
      id: pid,
      title: traverse_obj(info, ['ProgramStore', 'programInfo', 'title']) as string | undefined,
      channel_id: channelId,
      channel: traverse_obj(info, ['ProgramStore', 'channelInfo', 'title']) as string | undefined,
      uploader: traverse_obj(info, ['ProgramStore', 'podcasterInfo', 'podcaster', 'nickname']) as string | undefined,
      url: traverse_obj(info, ['ProgramStore', 'programInfo', 'audioUrl']) as string | undefined,
      vcodec: 'none',
      acodec: 'm4a',
      ext: 'm4a',
    };
  }
}
