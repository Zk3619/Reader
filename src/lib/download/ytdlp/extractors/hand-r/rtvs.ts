/** RTVSIE — ported from yt-dlp rtvs.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { parse_duration, traverse_obj, unified_timestamp } from '../../utils';

export class RTVSIE extends InfoExtractor {
  static IE_NAME = 'stvr';
  static IE_DESC = 'Slovak Television and Radio (formerly RTVS)';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:rtvs|stvr)\.sk\/(?:radio|televizia)\/archiv(?:\/\d+)?\/(?<id>\d+)\/?(?:[#?]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const iframeId = this._search_regex(
      /<iframe[^>]+id\s*=\s*"player_[^_]+_([0-9]+)"/,
      webpage,
      'Iframe ID',
    )!;
    const iframeUrl = this._search_regex(
      new RegExp(`<iframe[^>]+id\\s*=\\s*"player_[^_]+_${iframeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]+src\\s*=\\s*"([^"]+)"`),
      webpage,
      'Iframe URL',
    )!;

    const iframePage = await this._download_webpage(iframeUrl, videoId, 'Downloading iframe');
    const jsonUrl = this._search_regex(/var\s+url\s*=\s*"([^"]+)"\s*\+\s*ruurl/, iframePage, 'json URL')!;
    const data = await this._download_json<Record<string, unknown>>(
      `https:${jsonUrl}b=mozilla&p=win&v=97&f=0&d=1`,
      videoId,
    );

    if (data.clip) data.playlist = [data.clip];

    const sourceType = traverse_obj(data, ['playlist', 0, 'sources', 0, 'type']) as string | undefined;
    const sourceSrc = traverse_obj(data, ['playlist', 0, 'sources', 0, 'src']) as string | undefined;
    let formats: Format[];
    if (sourceType === 'audio/mp3' && sourceSrc) {
      formats = [{ url: sourceSrc, format_id: 'mp3', ext: 'mp3', vcodec: 'none' }];
    } else if (sourceSrc) {
      formats = await this._extract_m3u8_formats(sourceSrc, videoId);
    } else {
      formats = [];
    }

    return {
      id: videoId,
      display_id: iframeId,
      title: traverse_obj(data, ['playlist', 0, 'title']) as string | undefined,
      description: traverse_obj(data, ['playlist', 0, 'description']) as string | undefined,
      duration: parse_duration(traverse_obj(data, ['playlist', 0, 'length']) as string) ?? undefined,
      thumbnail: traverse_obj(data, ['playlist', 0, 'image']) as string | undefined,
      timestamp: unified_timestamp(traverse_obj(data, ['playlist', 0, 'datetime_create']) as string) ?? undefined,
      formats,
    };
  }
}
