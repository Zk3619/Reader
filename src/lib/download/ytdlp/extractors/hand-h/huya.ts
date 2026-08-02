/**
 * HuyaLiveIE / HuyaVideoIE — ported from yt-dlp huya.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  int_or_none,
  parse_duration,
  str_or_none,
  try_get,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import { md5Hex } from '../hand-a/helpers';

const RESOLUTION: Record<string, { width: number; height: number }> = {
  蓝光: { width: 1920, height: 1080 },
  超清: { width: 1280, height: 720 },
  流畅: { width: 800, height: 480 },
};

export class HuyaLiveIE extends InfoExtractor {
  static IE_NAME = 'huya:live';
  static IE_DESC = 'Huya live';
  static _VALID_URL = /https?:\/\/(?:www\.|m\.)?huya\.com\/(?!(?:video\/play\/))(?<id>[^/#?&]+)(?:\D|$)/;

  protected encrypt(
    params: Record<string, string>,
    streamInfo: Record<string, unknown>,
    streamName: string,
  ): [string, string] {
    const wsTime = params.wsTime || '0';
    const ct = (Number.parseInt(wsTime, 16) || 0) + Math.random();
    const presenterUid = Number(streamInfo.lPresenterUid);
    let uid: number;
    if (!streamName.startsWith(String(presenterUid))) {
      uid = presenterUid;
    } else {
      uid = Math.trunc((ct % 1e7) * 1e6) % 0xffffffff;
    }
    const u1 = uid & 0xffffffff00000000;
    const u2 = uid & 0xffffffff;
    const u3 = uid & 0xffffff;
    const u = (u1 | (u2 >> 24) | (u3 << 8)) >>> 0;
    params.u = String(u);
    params.seqid = String(Math.trunc(ct * 1000) + uid);
    params.ver = '1';
    params.uuid = String(Math.trunc((ct % 1e7) * 1e6) % 0xffffffff);
    params.t = '100';
    const fm = atob(params.fm || '').split('_', 1)[0] || '';
    const ss = md5Hex([params.seqid, params.ctype || '', params.t].join('|'));
    return [fm, ss];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const streamData = this._search_json<Record<string, unknown>>(/stream:\s/, webpage, 'stream', videoId, {
      default: null,
    });
    const dataArr = (streamData?.data as Array<Record<string, unknown>>) || [];
    const roomInfo = try_get(dataArr[0], (x) => x.gameLiveInfo as Record<string, unknown>, Object);
    if (!roomInfo) throw new ExtractorError('Can not extract the room info', { expected: true });

    const title =
      (roomInfo.roomName as string | undefined) ||
      (roomInfo.introduction as string | undefined) ||
      this._og_search_title(webpage) ||
      videoId;
    const screenType = roomInfo.screenType;
    const liveSourceType = roomInfo.liveSourceType;
    const streamInfoList = (dataArr[0]?.gameStreamInfoList as Array<Record<string, unknown>>) || [];
    if (!streamInfoList.length) throw new ExtractorError('Video is offline', { expected: true });

    const formats: Format[] = [];
    const multiStream = (streamData?.vMultiStreamInfo as Array<Record<string, unknown>>) || [];

    for (const streamInfo of streamInfoList) {
      const streamUrl = streamInfo.sFlvUrl as string | undefined;
      if (!streamUrl) continue;
      const streamName = String(streamInfo.sStreamName ?? '');
      const reSecret = !screenType && [0, 8, 13].includes(Number(liveSourceType));
      const antiCode = unescapeHTML(String(streamInfo.sFlvAntiCode ?? ''));
      const params: Record<string, string> = {};
      for (const part of antiCode.split('&')) {
        const eq = part.indexOf('=');
        if (eq >= 0) params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
      }
      let fm = '';
      let ss = '';
      if (reSecret) [fm, ss] = this.encrypt(params, streamInfo, streamName);

      for (const si of multiStream) {
        const displayName = String(si.sDisplayName ?? '');
        const match = displayName.match(/(.+?)(?:(\d+)M)?$/);
        const label = match?.[1] || displayName;
        const bitrate = match?.[2];
        const rate = si.iBitRate as number | undefined;
        if (rate) params.ratio = String(rate);
        else {
          delete params.ratio;
          if (bitrate) params.ratio = String(Number(bitrate) * 1000);
        }
        if (reSecret) {
          params.wsSecret = md5Hex([fm, params.u, streamName, ss, params.wsTime].join('_'));
        }
        const suffix = String(streamInfo.sFlvUrlSuffix ?? 'flv');
        const query = new URLSearchParams(params).toString();
        formats.push({
          ext: suffix,
          format_id: str_or_none(streamInfo.iLineIndex) ?? String(formats.length),
          tbr: rate ?? (bitrate ? Number(bitrate) * 1000 : undefined),
          url: `${streamUrl}/${streamName}.${suffix}${query ? `?${query}` : ''}`,
          ...(RESOLUTION[label] || {}),
        });
      }
    }

    return {
      id: videoId,
      title,
      formats,
      view_count: int_or_none(roomInfo.totalCount) ?? undefined,
      thumbnail: (roomInfo.screenshot as string | undefined) ?? undefined,
      description: (roomInfo.contentIntro as string | undefined) ?? undefined,
      http_headers: { Origin: 'https://www.huya.com', Referer: 'https://www.huya.com/' },
    };
  }
}

export class HuyaVideoIE extends InfoExtractor {
  static IE_NAME = 'huya:video';
  static IE_DESC = 'Huya video';
  static _VALID_URL = /https?:\/\/(?:www\.)?huya\.com\/video\/play\/(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const res = await this._download_json<{ data?: { moment?: Record<string, unknown> } }>(
      'https://liveapi.huya.com/moment/getMomentContent',
      videoId,
      undefined,
      { query: { videoId } },
    );
    const moment = res.data?.moment || {};
    const videoInfo = (moment.videoInfo as Record<string, unknown>) || {};
    const definitions = (videoInfo.definitions as Array<Record<string, unknown>>) || [];

    const formats: Format[] = [];
    for (const definition of definitions) {
      const m3u8 = url_or_none(definition.m3u8);
      if (!m3u8) continue;
      const fmts = await this._extract_m3u8_formats(m3u8, videoId, 'mp4', 'm3u8_native', undefined, undefined, undefined, undefined, false);
      for (const fmt of fmts) {
        if (definition.size != null) fmt.filesize = int_or_none(definition.size) ?? undefined;
        if (definition.defName != null) fmt.format_id = String(definition.defName);
        if (definition.height != null) fmt.height = int_or_none(definition.height) ?? undefined;
        if (definition.definition != null) fmt.quality = int_or_none(definition.definition) ?? undefined;
        if (definition.width != null) fmt.width = int_or_none(definition.width) ?? undefined;
      }
      formats.push(...fmts);
    }

    const categoriesRaw = videoInfo.category;
    const categories = categoriesRaw != null ? [String(categoriesRaw)] : undefined;
    const tagsRaw = videoInfo.tags;
    const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String).filter(Boolean) : undefined;
    const thumb = url_or_none(videoInfo.videoBigCover) || url_or_none(videoInfo.videoCover) || undefined;

    return {
      id: videoId,
      formats,
      title: String(videoInfo.videoTitle ?? videoId),
      categories,
      duration: parse_duration(videoInfo.videoDuration) ?? undefined,
      tags,
      thumbnail: thumb,
      uploader: videoInfo.nickName != null ? String(videoInfo.nickName) : undefined,
      uploader_id: videoInfo.uid != null ? String(videoInfo.uid) : undefined,
      view_count: int_or_none(videoInfo.videoPlayNum) ?? undefined,
      comment_count: int_or_none(moment.commentCount) ?? undefined,
      description: moment.content != null ? clean_html(String(moment.content)) ?? undefined : undefined,
      like_count: int_or_none(moment.favorCount) ?? undefined,
      timestamp: int_or_none(moment.cTime) ?? undefined,
    };
  }
}
