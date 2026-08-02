/**
 * JTBCIE / JTBCProgramIE — ported from yt-dlp jtbc.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, parse_duration, str_or_none, url_or_none } from '../../utils';

export class JTBCIE extends InfoExtractor {
  static IE_NAME = 'jtbc';
  static IE_DESC = 'jtbc.co.kr';
  static _VALID_URL =
    /https?:\/\/(?:vod\.jtbc\.co\.kr\/player\/(?:program|clip)|tv\.jtbc\.co\.kr\/(?:replay|trailer|clip)\/pr\d+\/pm\d+)\/(?<id>(?:ep|vo)\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    let videoId: string;

    if (displayId.toLowerCase().startsWith('vo')) {
      videoId = displayId.toUpperCase();
    } else {
      const webpage = await this._download_webpage(url, displayId);
      videoId = this._search_regex(/data-vod="(VO\d+)"/, webpage, 'vod id')!;
    }

    const playbackData = await this._download_json<Record<string, unknown>>(
      `https://api.jtbc.co.kr/vod/${videoId}`,
      videoId,
      'Downloading VOD playback data',
    );

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (playbackData.tracks as Array<Record<string, unknown>>) || []) {
      const file = url_or_none(sub?.file);
      if (!file) continue;
      const label = str_or_none(sub?.label) || 'und';
      const ext = file.includes('.') ? file.split('.').pop()!.split('?')[0]! : 'vtt';
      (subtitles[label] ||= []).push({ url: file, ext });
    }

    const formats: Format[] = [];
    const hlsList = ((playbackData.sources as Record<string, unknown>)?.HLS as Array<Record<string, unknown>>) || [];
    for (const item of hlsList) {
      const streamUrl = url_or_none(item?.file);
      if (!streamUrl) continue;
      const normalized = streamUrl.replace(/\/playlist_pd\d+\.m3u8/, '/playlist.m3u8');
      const fmts = await this._extract_m3u8_formats(normalized, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
      formats.push(...fmts);
    }

    const metadata = await this._download_json<{ vodDetail?: Record<string, unknown> }>(
      'https://now-api.jtbc.co.kr/v1/vod/detail',
      videoId,
      'Downloading mobile details',
      { fatal: false, query: { vodFileId: videoId } },
    );
    const detail = (metadata?.vodDetail as Record<string, unknown>) || {};
    const broadcastDate = str_or_none(detail.broadcastDate)?.replace(/\./g, '') || '';
    const releaseMatch = broadcastDate.match(/\d{8}/);

    return {
      id: videoId,
      display_id: displayId,
      title: str_or_none(detail.vodTitleView) ?? undefined,
      series: str_or_none(detail.programTitle) ?? undefined,
      age_limit: int_or_none(detail.watchAge) ?? undefined,
      release_date: releaseMatch?.[0],
      description: str_or_none(detail.episodeContents) ?? undefined,
      thumbnail: url_or_none(detail.imgFileUrl) ?? undefined,
      duration: parse_duration(playbackData.playTime) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class JTBCProgramIE extends InfoExtractor {
  static IE_NAME = 'JTBC:program';
  static _VALID_URL =
    /https?:\/\/(?:vod\.jtbc\.co\.kr\/program|tv\.jtbc\.co\.kr\/replay)\/(?<id>pr\d+)\/(?:replay|pm\d+)\/?(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programId = this._match_id(url);

    const vodList = await this._download_json<{ programReplayVodList?: Array<Record<string, unknown>> }>(
      'https://now-api.jtbc.co.kr/v1/vodClip/programHome/programReplayVodList',
      programId,
      'Downloading program replay list',
      { query: { programId, rowCount: '10000' } },
    );

    const entries: VideoInfo[] = [];
    for (const item of vodList?.programReplayVodList || []) {
      const episodeId = str_or_none(item?.episodeId);
      if (!episodeId) continue;
      entries.push(
        this.url_result(`https://vod.jtbc.co.kr/player/program/${episodeId}`, 'JTBC', episodeId),
      );
    }

    return this.playlist_result(entries, programId);
  }
}
