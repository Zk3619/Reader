/**
 * BiliLive (live.bilibili.com) — aligned with bilibili.py BiliLiveIE.
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { BILI_HEADERS } from './bilibili-shared';

const LIVE_FORMATS: Record<number, { format_id: string; format_note: string }> = {
  80: { format_id: 'low', format_note: '流畅' },
  150: { format_id: 'high_res', format_note: '高清' },
  250: { format_id: 'ultra_high_res', format_note: '超清' },
  400: { format_id: 'blue_ray', format_note: '蓝光' },
  10000: { format_id: 'source', format_note: '原画' },
  20000: { format_id: '4K', format_note: '4K' },
  30000: { format_id: 'dolby', format_note: '杜比' },
};

export class BiliLiveIE extends InfoExtractor {
  static IE_NAME = 'BiliLive';
  static _VALID_URL = /https?:\/\/live\.bilibili\.com\/(?:blanc\/)?(?<id>\d+)/i;
  static _TESTS = [
    { url: 'https://live.bilibili.com/196', only_matching: true },
    { url: 'https://live.bilibili.com/blanc/196', only_matching: true },
  ];

  private async callApi(
    path: string,
    roomId: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const resp = await this._download_json<Record<string, unknown>>(
      `https://api.live.bilibili.com/${path}`,
      roomId,
      undefined,
      { query, headers: BILI_HEADERS, fatal: false },
    );
    if (Number(resp.code) !== 0) {
      throw new ExtractorError(String(resp.message || 'Unable to download JSON metadata'));
    }
    return (resp.data as Record<string, unknown>) || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const roomId = this._match_id(url);
    const roomData = await this.callApi('room/v1/Room/get_info', roomId, { id: roomId });
    if (Number(roomData.live_status) === 0) {
      throw new ExtractorError('Streamer is not live', { expected: true });
    }

    const formats: Format[] = [];
    let liveTime: number | null = null;
    for (const qnStr of Object.keys(LIVE_FORMATS)) {
      const qn = Number(qnStr);
      const streamData = await this.callApi('xlive/web-room/v2/index/getRoomPlayInfo', roomId, {
        room_id: roomId,
        qn: String(qn),
        codec: '0,1',
        format: '0,2',
        mask: '0',
        no_playurl: '0',
        platform: 'web',
        protocol: '0,1',
      });
      liveTime = Number(streamData.live_time) || liveTime;
      const streams =
        (((streamData.playurl_info as Record<string, unknown>)?.playurl as Record<
          string,
          unknown
        >)?.stream as Array<Record<string, unknown>>) || [];
      for (const s of streams) {
        for (const fmt of (s.format as Array<Record<string, unknown>>) || []) {
          for (const codec of (fmt.codec as Array<Record<string, unknown>>) || []) {
            if (Number(codec.current_qn) !== qn) continue;
            for (const urlInfo of (codec.url_info as Array<Record<string, unknown>>) || []) {
              formats.push({
                ...LIVE_FORMATS[qn]!,
                url: `${urlInfo.host}${codec.base_url}${urlInfo.extra}`,
                ext: String(fmt.format_name || 'flv'),
                vcodec: codec.codec_name != null ? String(codec.codec_name) : null,
                quality: qn,
                http_headers: { Referer: url },
              });
            }
          }
        }
      }
    }

    return {
      id: roomId,
      title: roomData.title != null ? String(roomData.title) : roomId,
      description: roomData.description != null ? String(roomData.description) : null,
      thumbnail: roomData.user_cover != null ? String(roomData.user_cover) : null,
      timestamp: liveTime,
      formats,
      is_live: true,
      extractor: 'BiliLive',
      extractor_key: 'BiliLive',
      http_headers: { Referer: url },
    };
  }
}
