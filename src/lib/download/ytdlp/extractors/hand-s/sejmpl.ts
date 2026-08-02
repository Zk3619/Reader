/** SejmIE — ported from yt-dlp sejmpl.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, js_to_json, join_nonempty, update_url_query } from '../../utils';
import { strip_or_none } from './_helpers';

function isDst(date: Date): boolean {
  const year = date.getFullYear();
  const lastMarch = new Date(year, 2, 31);
  const lastOctober = new Date(year, 9, 31);
  const dow = (d: Date) => d.getDay();
  const lastSundayMarch = new Date(lastMarch);
  lastSundayMarch.setDate(lastMarch.getDate() - (dow(lastMarch) % 7));
  lastSundayMarch.setHours(2, 0, 0, 0);
  const lastSundayOctober = new Date(lastOctober);
  lastSundayOctober.setDate(lastOctober.getDate() - (dow(lastOctober) % 7));
  lastSundayOctober.setHours(3, 0, 0, 0);
  return date >= lastSundayMarch && date <= lastSundayOctober;
}

function rfc3339ToAtende(dateStr: string): number {
  const date = new Date(dateStr);
  const offsetHours = isDst(date) ? 1 : 0;
  date.setHours(date.getHours() + offsetHours);
  return Math.trunc((date.getTime() / 1000 - 978307200) * 1000);
}

export class SejmIE extends InfoExtractor {
  static IE_NAME = 'sejm';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?sejm\.gov\.pl\/[Ss]ejm(?<term>\d+)\.nsf\/transmisje(?:_arch)?\.xsp(?:\?[^#]*)?#(?<id>[\dA-F]+)/,
    /https?:\/\/(?:www\.)?sejm\.gov\.pl\/[Ss]ejm(?<term>\d+)\.nsf\/transmisje(?:_arch)?\.xsp\?(?:[^#]+&)?unid=(?<id>[\dA-F]+)/,
    /https?:\/\/sejm-embed\.redcdn\.pl\/[Ss]ejm(?<term>\d+)\.nsf\/VideoFrame\.xsp\/(?<id>[\dA-F]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const term = m.groups!.term!;
    const videoId = m.groups!.id!;
    const frame = await this._download_webpage(
      `https://sejm-embed.redcdn.pl/Sejm${term}.nsf/VideoFrame.xsp/${videoId}`,
      videoId,
    );
    const data = await this._download_json<Record<string, unknown>>(
      `https://www.sejm.gov.pl/Sejm${term}.nsf/transmisje_arch.xsp/json/${videoId}`,
      videoId,
    );
    const params = (data.params as Record<string, unknown>) || {};
    const title = strip_or_none(data.title) || videoId;

    let liveStatus: string | undefined;
    if (data.status === 'VIDEO_ENDED') liveStatus = 'was_live';
    else if (data.status === 'VIDEO_PLAYING') liveStatus = 'is_live';
    else this.report_warning(`unknown status: ${data.status}`);

    const startTime = rfc3339ToAtende(String(params.start || ''));
    let stopTime: number | undefined;
    let duration: number | undefined;
    if (liveStatus === 'was_live' && params.stop) {
      stopTime = rfc3339ToAtende(String(params.stop));
      duration = Math.trunc((stopTime - startTime) / 1000);
    }

    const entries: VideoInfo[] = [];
    const addEntry = (file: string | undefined, legacy = false) => {
      if (!file) return;
      let fileUrl = file.startsWith('//') ? `https:${file}` : file;
      if (!legacy) {
        fileUrl = update_url_query(fileUrl, { startTime: String(startTime) });
        if (stopTime != null) fileUrl = update_url_query(fileUrl, { stopTime: String(stopTime) });
        const streamId = this._search_regex(/\/o2\/sejm\/([^/]+)\/[^./]+\.livx/, fileUrl, 'stream id')!;
        entries.push({
          _type: 'url_transparent',
          url: fileUrl,
          duration,
          id: streamId,
          title: join_nonempty(title, streamId, ' - ') || streamId,
          ie_key: 'redcdnlivx',
        });
      } else {
        entries.push({ url: fileUrl, duration, id: videoId, title });
      }
    };

    const camerasRaw = this._search_regex(/var\s+cameras\s*=\s*(\[[\s\S]+?\]);/, frame, 'camera list', '[]', false);
    const cameras = this._parse_json<Array<Record<string, unknown>>>(
      camerasRaw || '[]',
      videoId,
      js_to_json,
      false,
    ) || [];
    for (const camera of cameras) {
      const cameraFile = camera.file as Record<string, unknown> | undefined;
      if (!cameraFile) continue;
      if (cameraFile.flv) addEntry(String(cameraFile.flv));
      else if (cameraFile.mp4) addEntry(String(cameraFile.mp4), true);
      else this.report_warning('Unknown camera stream type found');
    }

    if (params.mig) {
      addEntry(
        this._search_regex(/var sliUrl\s*=\s*'([^']+)'/, frame, 'sign language interpreter url', null, false) ||
          undefined,
      );
    }

    return {
      _type: 'playlist',
      entries,
      id: videoId,
      title,
      description: clean_html(String(data.desc || '')) || undefined,
      duration,
      live_status: liveStatus,
      location: strip_or_none(data.location) || undefined,
    };
  }
}