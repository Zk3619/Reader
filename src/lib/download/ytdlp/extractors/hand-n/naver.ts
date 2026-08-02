/**
 * NaverBaseIE / NaverIE / NaverLiveIE — ported from yt-dlp naver.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  dict_get,
  int_or_none,
  traverse_obj,
  try_get,
  update_url_query,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

const CAPTION_EXT_RE = /\.(?:ttml|vtt)/;

function processSubtitles(
  vodData: Record<string, unknown>,
  processUrl: (url: string) => string[],
): { subtitles: Record<string, Subtitle[]>; automatic_captions: Record<string, Subtitle[]> } {
  const ret: { subtitles: Record<string, Subtitle[]>; automatic_captions: Record<string, Subtitle[]> } = {
    subtitles: {},
    automatic_captions: {},
  };
  const fanCounts: Record<string, Record<string, number>> = { subtitles: {}, automatic_captions: {} };

  for (const caption of (((vodData.captions as Record<string, unknown>)?.list as Array<Record<string, unknown>>) || [])) {
    const captionUrl = caption.source as string | undefined;
    if (!captionUrl) continue;
    const typeKey = caption.type === 'auto' ? 'automatic_captions' : 'subtitles';
    let lang =
      (caption.locale as string) ||
      [caption.language, caption.country].filter(Boolean).join('-') ||
      'und';
    if (caption.type === 'fan') {
      const n = (fanCounts[typeKey]![lang] = (fanCounts[typeKey]![lang] || 0) + 1);
      lang = `${lang}_fan${n}`;
    }
    const name = [caption.label, caption.fanName].filter(Boolean).join(' - ') || undefined;
    for (const subUrl of processUrl(captionUrl)) {
      const ext = CAPTION_EXT_RE.test(subUrl) ? subUrl.replace(CAPTION_EXT_RE, '').split('.').pop() || 'vtt' : 'vtt';
      (ret[typeKey][lang] ||= []).push({ url: subUrl, ext, name });
    }
  }
  return ret;
}

export class NaverBaseIE extends InfoExtractor {
  static IE_NAME = 'naverbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NaverBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractVideoInfo(videoId: string, vid: string, key: string): Promise<VideoInfo> {
    const videoData = await this._download_json<Record<string, unknown>>(
      `http://play.rmcnmv.naver.com/vod/play/v2.0/${vid}`,
      videoId,
      undefined,
      { query: { key } },
    );
    const meta = (videoData.meta as Record<string, unknown>) || {};
    const title = String(meta.subject ?? videoId);
    const formats: Format[] = [];

    const getList = (x: string): Array<Record<string, unknown>> =>
      (try_get(videoData, (y) => (y as Record<string, Record<string, unknown[]>>)[`${x}s`]?.list) as
        | Array<Record<string, unknown>>
        | undefined) || [];

    const extractFormats = async (
      streams: Array<Record<string, unknown>>,
      streamType: string,
      query: Record<string, string> = {},
    ) => {
      for (const stream of streams) {
        let streamUrl = stream.source as string | undefined;
        if (!streamUrl) continue;
        streamUrl = update_url_query(streamUrl, query);
        const encodingOption = (stream.encodingOption as Record<string, unknown>) || {};
        const bitrate = (stream.bitrate as Record<string, unknown>) || {};
        formats.push({
          format_id: `${stream.type || streamType}_${dict_get(encodingOption, ['name', 'id'])}`,
          url: streamUrl,
          ext: 'mp4',
          width: int_or_none(encodingOption.width) ?? undefined,
          height: int_or_none(encodingOption.height) ?? undefined,
          vbr: int_or_none(bitrate.video) ?? undefined,
          abr: int_or_none(bitrate.audio) ?? undefined,
          filesize: int_or_none(stream.size) ?? undefined,
          protocol: streamType === 'HLS' ? 'm3u8_native' : undefined,
        });
        if (streamType === 'HLS') {
          const hls = await this._extract_m3u8_formats(
            streamUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            streamType,
            undefined,
            false,
          );
          formats.push(...hls);
        }
      }
    };

    await extractFormats(getList('video'), 'H264');
    for (const streamSet of (videoData.streams as Array<Record<string, unknown>>) || []) {
      const query: Record<string, string> = {};
      for (const param of (streamSet.keys as Array<Record<string, unknown>>) || []) {
        query[String(param.name)] = String(param.value);
      }
      const streamType = String(streamSet.type ?? '');
      const videos = streamSet.videos as Array<Record<string, unknown>> | undefined;
      if (videos) {
        await extractFormats(videos, streamType, query);
      } else if (streamType === 'HLS') {
        const streamUrl = streamSet.source as string | undefined;
        if (streamUrl) {
          formats.push(
            ...(await this._extract_m3u8_formats(
              update_url_query(streamUrl, query),
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              streamType,
              undefined,
              false,
            )),
          );
        }
      }
    }

    const replaceExt = (x: string, y: string) => x.replace(CAPTION_EXT_RE, `.${y}`);
    const getSubs = (captionUrl: string) =>
      CAPTION_EXT_RE.test(captionUrl)
        ? [replaceExt(captionUrl, 'ttml'), replaceExt(captionUrl, 'vtt')]
        : [captionUrl];

    const user = (meta.user as Record<string, unknown>) || {};
    const subs = processSubtitles(videoData, getSubs);

    return {
      id: videoId,
      title,
      formats,
      thumbnail: try_get(meta, (x) => (x as Record<string, Record<string, string>>).cover?.source) || undefined,
      view_count: int_or_none(meta.count) ?? undefined,
      uploader_id: user.id as string | undefined,
      uploader: user.name as string | undefined,
      uploader_url: user.url as string | undefined,
      ...subs,
    };
  }

  protected async _callApi(path: string, videoId: string): Promise<Record<string, unknown>> {
    const apiEndpoint = `https://apis.naver.com/now_web2/now_web_api/v1${path}`;
    const key = new TextEncoder().encode(
      'nbxvs5nwNG9QKEWK0ADjYA4JZoujF4gHcIwvoCxFTPAeamq5eemvt5IWAYXxrbYM',
    );
    const msgpad = Date.now();
    const msg = `${apiEndpoint.slice(0, 255)}${msgpad}`;
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
    const md = btoa(String.fromCharCode(...new Uint8Array(sig)));

    const resp = await this._download_json<{ result?: Record<string, unknown> }>(apiEndpoint, videoId, undefined, {
      headers: this.geo_verification_headers(),
      query: { msgpad: String(msgpad), md },
    });
    return resp.result || {};
  }
}

export class NaverIE extends NaverBaseIE {
  static IE_NAME = 'naver';
  static _VALID_URL = /https?:\/\/(?:m\.)?tv(?:cast)?\.naver\.com\/(?:v|embed)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._callApi(`/clips/${videoId}/play-info`, videoId);
    const clip = (data.clip as Record<string, unknown>) || {};
    const play = (data.play as Record<string, unknown>) || {};
    const vid = clip.videoId != null ? String(clip.videoId) : undefined;
    const inKey = play.inKey != null ? String(play.inKey) : undefined;
    if (!vid || !inKey) throw new ExtractorError('Unable to extract video info');

    const info = await this._extractVideoInfo(videoId, vid, inKey);
    return {
      ...info,
      title: (clip.title as string) || info.title,
      description: clip.description as string | undefined,
      timestamp: parseIso8601(clip.firstExposureDatetime) ?? undefined,
      duration: int_or_none(clip.playTime) ?? undefined,
      like_count: int_or_none(clip.likeItCount) ?? undefined,
      view_count: int_or_none(clip.playCount) ?? info.view_count,
      comment_count: int_or_none(clip.commentCount) ?? undefined,
      thumbnail: url_or_none(clip.thumbnailImageUrl) ?? undefined,
      uploader: clip.channelName as string | undefined,
      uploader_id: clip.channelId as string | undefined,
      uploader_url: url_or_none(clip.channelUrl) ?? undefined,
      age_limit: clip.adultVideo ? 19 : undefined,
    };
  }
}

export class NaverLiveIE extends NaverBaseIE {
  static IE_NAME = 'Naver:live';
  static _VALID_URL = /https?:\/\/(?:m\.)?tv(?:cast)?\.naver\.com\/l\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const data = await this._callApi(`/live-end/normal/${videoId}/play-info?renewLastPlayDate=true`, videoId);
    const live = (data.live as Record<string, unknown>) || {};
    const status = live.liveStatus;
    if (status === 'CLOSED') throw new ExtractorError('Stream is offline.', { expected: true });
    if (status !== 'OPENED') throw new ExtractorError(`Unknown status ${String(status)}`);

    const playbackBody = JSON.parse(String(data.playbackBody ?? '{}')) as Record<string, unknown>;
    const m3u8Path = traverse_obj(playbackBody, ['media', 0, 'path']) as string | undefined;

    return {
      id: videoId,
      formats: m3u8Path ? await this._extract_m3u8_formats(m3u8Path, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, true) : [],
      title: live.title as string | undefined,
      channel: live.channelName as string | undefined,
      channel_id: live.channelId as string | undefined,
      description: live.description as string | undefined,
      like_count:
        int_or_none(live.likeCount) ?? int_or_none(live.likeItCount) ?? undefined,
      thumbnail: url_or_none(live.thumbnailImageUrl) ?? undefined,
      start_time:
        parseIso8601(live.startTime) ??
        parseIso8601(live.startDateTime) ??
        parseIso8601(live.startYmdt) ??
        undefined,
      is_live: true,
    };
  }
}
