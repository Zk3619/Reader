/** MGTVIE — ported from yt-dlp mgtv.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';
import { urljoin } from './_helpers';

const RESOLUTIONS: Record<string, [string, string]> = {
  标清: ['480p', '854x480'],
  高清: ['540p', '960x540'],
  超清: ['720p', '1280x720'],
  蓝光: ['1080p', '1920x1080'],
};

function makeTk2(): string {
  const raw = `did=${crypto.randomUUID()}|pno=1030|ver=0.3.0301|clit=${Math.floor(Date.now() / 1000)}`;
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').split('').reverse().join('');
}

export class MGTVIE extends InfoExtractor {
  static IE_NAME = 'MangoTV';
  static IE_DESC = '芒果TV';
  static _GEO_COUNTRIES = ['CN'];
  static _VALID_URL = /https?:\/\/(?:w(?:ww)?\.)?mgtv\.com\/[bv]\/(?:[^/]+\/)*(?<id>\d+)\.html/;

  protected async _getSubtitles(videoId: string, domain: string): Promise<Record<string, Subtitle[]>> {
    const info = (await this._download_json<Record<string, unknown>>(
      `https://pcweb.api.mgtv.com/video/title?videoId=${videoId}`,
      videoId,
      undefined,
      { fatal: false },
    )) || {};
    const subtitles: Record<string, Subtitle[]> = {};
    const titleSubs = (((info.data as Record<string, unknown>)?.title as unknown[]) || []) as Array<Record<string, unknown>>;
    for (const sub of titleSubs) {
      const urlSub = str_or_none(sub.url);
      if (!urlSub) continue;
      const locale = str_or_none(sub.captionSimpleName) || 'en';
      const subJson = (await this._download_json<Record<string, unknown>>(
        `${domain}${urlSub}`,
        videoId,
        `Download subtitle for locale ${sub.name} (${locale})`,
        { fatal: false },
      )) || {};
      const subUrl = url_or_none(subJson.info);
      if (!subUrl) continue;
      (subtitles[locale.toLowerCase()] ||= []).push({ url: subUrl, name: str_or_none(sub.name) ?? undefined, ext: 'srt' });
    }
    return subtitles;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const tk2 = makeTk2();
    let apiData: Record<string, unknown>;
    try {
      apiData = (
        await this._download_json<{ data: Record<string, unknown> }>('https://pcweb.api.mgtv.com/player/video', videoId, undefined, {
          query: { tk2, video_id: videoId, type: 'pch5' },
          headers: this.geo_verification_headers(),
        })
      ).data;
    } catch (e) {
      throw new ExtractorError(String(e), { expected: true });
    }

    const streamData = (
      await this._download_json<{ data: Record<string, unknown> }>('https://tinker.glb.mgtv.com/player/getSource', videoId, undefined, {
        query: {
          _support: '10000000',
          tk2,
          pm2: String(((apiData.atc as Record<string, unknown>)?.pm2) ?? ''),
          video_id: videoId,
          type: 'pch5',
          auth_mode: '1',
          cxid: '',
          supportMse: '1',
          src: 'intelmgtv',
          abroad: this._get_cookies('https://www.mgtv.com').abroad || '10',
          allowedRC: '1',
        },
        headers: this.geo_verification_headers(),
      })
    ).data;

    const streamDomain = url_or_none((streamData.stream_domain as string[] | undefined)?.[0]);
    const formats: Format[] = [];
    const streams = (streamData.stream as Array<Record<string, unknown>>) || [];
    for (let idx = 0; idx < streams.length; idx++) {
      const stream = streams[idx]!;
      if (!stream.url) continue;
      const streamName = str_or_none(stream.name) || str_or_none(stream.standardName) || str_or_none(stream.barName);
      const resolutionEntry = streamName ? RESOLUTIONS[streamName] : undefined;
      const resolution =
        resolutionEntry && stream.scale === '16:9'
          ? resolutionEntry[1]
          : resolutionEntry?.[0];
      const infoJson = await this._download_json<Record<string, unknown>>(
        urljoin(String(streamDomain ?? ''), String(stream.url)),
        videoId,
        `Downloading video info for format ${resolution || streamName}`,
        { headers: this.geo_verification_headers(), fatal: false },
      );
      const formatUrl = url_or_none(infoJson?.info);
      if (!formatUrl) continue;
      const tbr =
        int_or_none(stream.filebitrate) ??
        int_or_none(this._search_regex(/_(\d+)_mp4\//, formatUrl, 'tbr', null, false));
      formats.push({
        format_id: String(tbr ?? idx),
        url: formatUrl,
        ext: 'mp4',
        tbr: tbr ?? undefined,
        vcodec: str_or_none(stream.videoFormat) ?? undefined,
        acodec: str_or_none(stream.audioFormat) ?? undefined,
        ...parseMgtvResolution(resolution),
        protocol: 'm3u8_native',
        http_headers: { Referer: url },
        format_note: streamName ?? undefined,
      });
    }

    const info = (apiData.info as Record<string, unknown>) || {};
    return {
      id: videoId,
      formats,
      title: str_or_none(info.title)?.trim(),
      description: str_or_none(info.desc) ?? undefined,
      duration: int_or_none(info.duration) ?? undefined,
      thumbnail: url_or_none(info.thumb) ?? undefined,
      subtitles: await this._getSubtitles(videoId, String(streamDomain ?? '')),
    };
  }
}

function parseMgtvResolution(res?: string): { width?: number; height?: number } {
  if (!res) return {};
  const parts = res.split('x');
  if (parts.length === 2) return { width: Number(parts[0]), height: Number(parts[1]) };
  const m = res.match(/(\d+)p/i);
  return m ? { height: Number(m[1]) } : {};
}
