/**
 * BundestagIE — ported from yt-dlp bundestag.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, int_or_none, url_or_none } from '../../utils';

const INSTANCE_FORMAT =
  'https://cldf-wzw-od.r53.cdn.tv1.eu/13014bundestagod/_definst_/13014bundestag/ondemand/3777parlamentsfernsehen/archiv/app144277506/145293313/{0}/{0}_playlist.smil/playlist.m3u8';
const OVERLAY_URL = 'https://www.bundestag.de/mediathekoverlay';
const SHARE_URL = 'https://webtv.bundestag.de/player/macros/_x_s-144277506/shareData.json?contentId=';
const SHARE_AUDIO_REGEX = /\/\d+_(?<codec>\w+)_(?<bitrate>\d+)kb_(?<channels>\w+)_\w+_\d+\.(?<ext>\w+)/;
const SHARE_VIDEO_REGEX = /\/\d+_(?<codec>\w+)_(?<width>\w+)_(?<height>\w+)_(?<bitrate>\d+)kb_\w+_\w+_\d+\.(?<ext>\w+)/;
const CHANNEL_MAP: Record<string, number> = { mono: 1, stereo: 2 };

export class BundestagIE extends InfoExtractor {
  static IE_NAME = 'bundestag';
  static _VALID_URL = [
    /https?:\/\/dbtg\.tv\/[cf]vid\/(?<id>\d+)/,
    /https?:\/\/www\.bundestag\.de\/mediathek\/?\?(?:[^#]+&)?videoid=(?<id>\d+)/,
  ];

  protected async _btExtractShareFormats(videoId: string): Promise<Format[]> {
    const shareData = await this._download_json<Record<string, unknown>>(
      `${SHARE_URL}${videoId}`,
      videoId,
      'Downloading share format JSON',
    );
    const status = shareData.status as Record<string, unknown> | undefined;
    if (Number(status?.code) !== 1) {
      this.report_warning(`Share API response: ${status?.message || 'Unknown Share API Error'}`);
      return [];
    }

    const formats: Format[] = [];
    for (const [name, rawUrl] of Object.entries(shareData)) {
      if (typeof name !== 'string' || !url_or_none(rawUrl)) continue;
      const u = rawUrl as string;
      if (name.startsWith('audio')) {
        const match = u.match(SHARE_AUDIO_REGEX);
        formats.push({
          format_id: name,
          url: u,
          vcodec: 'none',
          acodec: match?.groups?.codec,
          audio_channels: match?.groups?.channels ? CHANNEL_MAP[match.groups.channels] : undefined,
          abr: int_or_none(match?.groups?.bitrate) ?? undefined,
          ext: match?.groups?.ext,
        } as Format);
      } else if (name.startsWith('download')) {
        const match = u.match(SHARE_VIDEO_REGEX);
        formats.push({
          format_id: name,
          url: u,
          vcodec: match?.groups?.codec,
          tbr: int_or_none(match?.groups?.bitrate) ?? undefined,
          width: int_or_none(match?.groups?.width) ?? undefined,
          height: int_or_none(match?.groups?.height) ?? undefined,
          ext: match?.groups?.ext,
        } as Format);
      }
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const formats: Format[] = [];

    try {
      formats.push(
        ...(await this._extract_m3u8_formats(
          INSTANCE_FORMAT.replace(/\{0\}/g, videoId),
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'instance',
        )),
      );
    } catch (error) {
      this.report_warning(`Error extracting hls formats: ${(error as Error).message}`);
    }
    formats.push(...(await this._btExtractShareFormats(videoId)));
    if (!formats.length) this.raise_no_formats('Could not find suitable formats');

    const overlay = await this._download_webpage(OVERLAY_URL, videoId, 'Downloading metadata overlay', {
      query: { videoid: videoId, view: 'main' },
      fatal: false,
    });

    const titleBlock = this._search_regex(/<h3[^>]*>([\s\S]*?)<\/h3>/, overlay, 'title', null, false);
    const descBlock = this._search_regex(/<p[^>]*>([\s\S]*?)<\/p>/, overlay, 'description', null, false);

    return {
      id: videoId,
      formats,
      title: titleBlock ? clean_html(titleBlock.replace(/<span[^>]*>[^<]+<\/span>/g, '')) || undefined : undefined,
      description: descBlock ? clean_html(descBlock) || undefined : undefined,
    };
  }
}
