/**
 * BaiduVideoIE — aligned with yt-dlp baidu.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unescapeHTML } from '../../utils';

export class BaiduVideoIE extends InfoExtractor {
  static IE_NAME = 'BaiduVideo';
  static IE_DESC = '百度视频';
  static _VALID_URL = /https?:\/\/v\.baidu\.com\/(?<type>[a-z]+)\/(?<id>\d+)\.htm/i;

  private async _call_api(
    path: string,
    category: string,
    playlistId: string,
    note: string,
  ): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `http://app.video.baidu.com/${path}/?worktype=adnative${category}&id=${playlistId}`,
      playlistId,
      note,
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let category = m.groups?.type ?? m[1] ?? '';
    const playlistId = m.groups?.id ?? m[2] ?? '';
    if (category === 'show') category = 'tvshow';
    if (category === 'tv') category = 'tvplay';

    const playlistDetail = await this._call_api(
      'xqinfo',
      category,
      playlistId,
      'Download playlist JSON metadata',
    );

    const playlistTitle = String(playlistDetail.title ?? playlistId);
    const playlistDescription = unescapeHTML(str(playlistDetail.intro));

    const episodesDetail = await this._call_api(
      'xqsingle',
      category,
      playlistId,
      'Download episodes JSON metadata',
    );

    const videos = (episodesDetail.videos as Record<string, unknown>[]) || [];
    const entries = videos.map((episode) =>
      this.url_result(String(episode.url), null, undefined, str(episode.title) ?? undefined),
    );

    return this.playlist_result(entries, playlistId, playlistTitle, playlistDescription);
  }
}

function str(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}
