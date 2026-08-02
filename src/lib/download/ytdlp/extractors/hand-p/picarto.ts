/** PicartoIE / PicartoVodIE — ported from yt-dlp picarto.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { str_or_none, url_or_none } from '../../utils';
import { strip_or_none } from './_helpers';

function updateUrl(url: string, opts: { scheme?: string }): string {
  const u = new URL(url);
  if (opts.scheme) u.protocol = `${opts.scheme}:`;
  return u.toString();
}

export class PicartoIE extends InfoExtractor {
  static IE_NAME = 'picarto';
  static _VALID_URL = /https?:\/\/(?:www\.)?picarto\.tv\/(?<id>[^/#?]+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const query = `{ channel(name: "${channelId}") { adult id online stream_name title } getLoadBalancerUrl(channel_name: "${channelId}") { url } }`;
    const data = (
      await this._download_json<{ data: Record<string, unknown> }>('https://ptvintern.picarto.tv/ptvapi', channelId, undefined, {
        query: { query },
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      })
    ).data;
    const metadata = (data.channel as Record<string, unknown>) || {};
    if (metadata.online === 0) throw new ExtractorError('Stream is offline', { expected: true });

    const lbUrl = updateUrl(String((data.getLoadBalancerUrl as Record<string, unknown>)?.url ?? ''), { scheme: 'https' });
    const cdnData = await this._download_json<Record<string, unknown>>(
      `${lbUrl}/stream/json_${metadata.stream_name}.js`,
      channelId,
      'Downloading load balancing info',
    );

    const formats: Format[] = [];
    for (const source of (cdnData.source as Array<Record<string, unknown>>) || []) {
      const sourceUrl = url_or_none(source.url);
      if (!sourceUrl) continue;
      if (source.type === 'html5/application/vnd.apple.mpegurl') {
        formats.push(...(await this._extract_m3u8_formats(sourceUrl, channelId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)));
      } else if (source.type === 'html5/video/mp4') {
        formats.push({ url: sourceUrl, format_id: 'mp4' });
      }
    }

    const mature = metadata.adult;
    return {
      id: channelId,
      title: strip_or_none(metadata.title) ?? undefined,
      is_live: true,
      channel: channelId,
      channel_id: str_or_none(metadata.id) ?? undefined,
      channel_url: `https://picarto.tv/${channelId}`,
      age_limit: mature == null ? undefined : mature ? 18 : 0,
      formats,
    };
  }
}

export class PicartoVodIE extends InfoExtractor {
  static IE_NAME = 'picarto:vod';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?picarto\.tv\/(?:videopopout|\w+(?:\/profile)?\/videos)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const query = `{ video(id: "${videoId}") { id title adult file_name video_recording_image_url channel { name } } }`;
    const data = (
      await this._download_json<{ data: { video: Record<string, unknown> } }>('https://ptvintern.picarto.tv/ptvapi', videoId, undefined, {
        query: { query },
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      })
    ).data.video;

    const fileName = String(data.file_name ?? '');
    let netloc = 'picarto.tv';
    try {
      netloc = new URL(String(data.video_recording_image_url ?? '')).hostname || netloc;
    } catch {
      /* ignore */
    }
    const formats: Format[] = await this._extract_m3u8_formats(
      `https://${netloc}/stream/hls/${fileName}/index.m3u8`,
      videoId,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    return {
      id: str_or_none(data.id) || videoId,
      title: str_or_none(data.title)?.trim() ?? undefined,
      thumbnail: url_or_none(data.video_recording_image_url) ?? undefined,
      channel: str_or_none((data.channel as Record<string, unknown>)?.name) ?? undefined,
      age_limit: data.adult ? 18 : 0,
      formats,
    };
  }
}
