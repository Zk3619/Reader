/**
 * EplusIbIE — ported from yt-dlp eplus.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { unified_timestamp } from '../../utils';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0';

export class EplusIbIE extends InfoExtractor {
  static IE_NAME = 'eplus';
  static IE_DESC = 'e+ (イープラス)';
  static _VALID_URL = [
    /https?:\/\/live\.eplus\.jp\/ex\/player\?ib=(?<id>(?:\w|%2B|%2F){86}%3D%3D)/,
    /https?:\/\/live\.eplus\.jp\/(?<id>sample|\d+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const handle = await this._request_webpage(url, videoId, undefined, {
      headers: { 'User-Agent': USER_AGENT },
    });
    let webpage = handle?.text ?? '';
    if (handle?.url.startsWith('https://live.eplus.jp/member/auth')) {
      this.raise_login_required('Login required for this event');
    }

    if (!webpage) {
      webpage = await this._download_webpage(url, videoId, undefined, { headers: { 'User-Agent': USER_AGENT } });
    }

    const dataJson = this._search_json<Record<string, unknown>>(/<script>\s*var app\s*=/, webpage, 'data json', videoId)!;

    if (dataJson.drm_mode === 'ON') {
      this.report_warning('This video is DRM protected');
    }
    if (dataJson.is_pass_ticket === 'YES') {
      throw new ExtractorError('This URL is for a pass ticket instead of a player page', { expected: true });
    }

    const deliveryStatus = dataJson.delivery_status as string | undefined;
    const archiveMode = dataJson.archive_mode as string | undefined;
    const releaseTimestamp =
      unified_timestamp(dataJson.event_datetime as string | undefined) != null
        ? (unified_timestamp(dataJson.event_datetime as string) ?? undefined)! - 32400
        : undefined;
    const releaseTimestampStr = dataJson.event_datetime_text as string | undefined;

    let liveStatus: string;
    if (deliveryStatus === 'PREPARING') liveStatus = 'is_upcoming';
    else if (deliveryStatus === 'STARTED') liveStatus = 'is_live';
    else if (deliveryStatus === 'STOPPED') {
      if (archiveMode !== 'ON') {
        throw new ExtractorError('This event has ended and there is no archive for this event', { expected: true });
      }
      liveStatus = 'post_live';
    } else if (deliveryStatus === 'WAIT_CONFIRM_ARCHIVED') liveStatus = 'post_live';
    else if (deliveryStatus === 'CONFIRMED_ARCHIVE') liveStatus = 'was_live';
    else {
      this.report_warning(`Unknown delivery_status ${deliveryStatus}, treat it as a live`);
      liveStatus = 'is_live';
    }

    const formats: Format[] = [];
    const m3u8PlaylistUrls =
      (this._search_json<string[]>(/var\s+listChannels\s*=/, webpage, 'hls URLs', videoId, {
        default: [],
      }) as string[]) || [];

    if (!m3u8PlaylistUrls.length) {
      if (liveStatus === 'is_upcoming') {
        this.raise_no_formats(
          `Could not find the playlist URL. This live event will begin at ${releaseTimestampStr} JST`,
          true,
        );
      }
      this.raise_no_formats('Could not find the playlist URL. This event may not be accessible', true);
    } else if (liveStatus === 'is_upcoming') {
      this.raise_no_formats(`This live event will begin at ${releaseTimestampStr} JST`, true);
    } else if (liveStatus === 'post_live') {
      this.raise_no_formats('This event has ended, and the archive will be available shortly', true);
    } else {
      for (const m3u8Url of m3u8PlaylistUrls) {
        formats.push(...(await this._extract_m3u8_formats(m3u8Url, videoId)));
      }
      const warning = 'Due to technical limitations, the download will be interrupted after one hour';
      if (liveStatus === 'is_live') this.report_warning(warning);
      else if (liveStatus === 'was_live') {
        this.report_warning(`${warning}. You can restart to continue the download`);
      }
    }

    return {
      id: String(dataJson.app_id ?? videoId),
      title: (dataJson.app_name as string) || undefined,
      formats,
      live_status: liveStatus,
      description: (dataJson.content as string) || undefined,
      release_timestamp: releaseTimestamp,
    };
  }
}
