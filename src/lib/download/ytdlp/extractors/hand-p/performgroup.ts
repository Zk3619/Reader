/** PerformGroupIE — ported from yt-dlp performgroup.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, str_or_none, traverse_obj } from '../../utils';

export class PerformGroupIE extends InfoExtractor {
  static IE_NAME = 'performgroup';
  static _VALID_URL =
    /https?:\/\/player\.performgroup\.com\/eplayer(?:\/eplayer\.html|\.js)#?\/?(?<id>[0-9a-f]{26})\.(?<auth_token>[0-9a-z]{26})/;

  protected async _callApi(service: string, authToken: string, contentId: string, refererUrl: string): Promise<Record<string, unknown>> {
    return this._download_json(`http://ep3.performfeeds.com/ep${service}/${authToken}/${contentId}/`, contentId, undefined, {
      headers: { Referer: refererUrl, Origin: 'http://player.performgroup.com' },
      query: { _fmt: 'json' },
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playerId = m.groups?.id!;
    const authToken = m.groups?.auth_token!;
    const bootstrap = await this._callApi('bootstrap', authToken, playerId, url);
    const sourceItems = traverse_obj(bootstrap, ['config', 'dataSource', 'sourceItems', 0, 'videos', 0]) as Record<string, unknown>;
    const videoId = String(sourceItems.uuid ?? '');
    const vod = await this._callApi('vod', authToken, videoId, url);
    const media = ((vod.videos as Record<string, unknown>)?.video as Array<Record<string, unknown>>)?.[0]?.media as Record<string, unknown>;

    const formats: Format[] = [];
    const hlsUrl = str_or_none((media.hls as Record<string, unknown>)?.url);
    if (hlsUrl) {
      formats.push(...(await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
    }

    for (const c of (media.content as Array<Record<string, unknown>>) || []) {
      const cUrl = str_or_none(c.url);
      if (!cUrl) continue;
      const tbr = int_or_none(c.bitrate, 1000) ?? undefined;
      formats.push({
        format_id: join_nonempty('http', tbr != null ? String(tbr) : null) || 'http',
        url: cUrl,
        tbr,
        width: int_or_none(c.width) ?? undefined,
        height: int_or_none(c.height) ?? undefined,
        filesize: int_or_none(c.fileSize) ?? undefined,
        vcodec: str_or_none(c.type) ?? undefined,
        fps: int_or_none(c.videoFrameRate) ?? undefined,
        vbr: int_or_none(c.videoRate, 1000) ?? undefined,
        abr: int_or_none(c.audioRate, 1000) ?? undefined,
      });
    }

    return {
      id: videoId,
      title: String(sourceItems.title ?? ''),
      description: str_or_none(sourceItems.description) ?? undefined,
      thumbnail: str_or_none(sourceItems.poster) ?? undefined,
      duration: int_or_none(sourceItems.duration) ?? undefined,
      timestamp: int_or_none(sourceItems.publishedTime, 1000) ?? undefined,
      formats,
    };
  }
}