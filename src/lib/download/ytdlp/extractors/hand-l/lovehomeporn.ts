/**
 * LoveHomePornIE — ported from yt-dlp lovehomeporn.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { float_or_none } from '../../utils';

export class LoveHomePornIE extends InfoExtractor {
  static IE_NAME = 'lovehomeporn';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?lovehomeporn\.com\/video\/(?<id>\d+)(?:\/(?<display_id>[^/?#&]+))?/;

  protected async _extractNuevo(configUrl: string, videoId: string): Promise<VideoInfo> {
    const configText = await this._download_webpage(configUrl, videoId);
    const title = this._search_regex(/<title>([\s\S]*?)<\/title>/i, configText, 'title')?.trim();
    if (!title) throw new ExtractorError('No title in nuevo config');

    const mediaId =
      this._search_regex(/<mediaid>([\s\S]*?)<\/mediaid>/i, configText, 'mediaid', null, false) || videoId;
    const thumbnail =
      this._search_regex(/<(?:image|thumb)>([\s\S]*?)<\/(?:image|thumb)>/i, configText, 'thumbnail', null, false) ||
      undefined;
    const duration = float_or_none(
      this._search_regex(/<duration>([\s\S]*?)<\/duration>/i, configText, 'duration', null, false),
    );

    const formats: Format[] = [];
    for (const [tag, formatId] of [
      ['file', 'sd'],
      ['filehd', 'hd'],
    ] as const) {
      const videoUrl = this._search_regex(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'), configText, tag, null, false);
      if (videoUrl) formats.push({ url: videoUrl.trim(), format_id: formatId });
    }
    if (!formats.length) this.raise_no_formats('No formats found');

    return {
      id: mediaId,
      title,
      thumbnail: thumbnail ? thumbnail.trim() : undefined,
      duration: duration ?? undefined,
      formats,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id || this._match_id(url);
    const displayId = m.groups?.display_id;

    const info = await this._extractNuevo(
      `http://lovehomeporn.com/media/nuevo/config.php?key=${videoId}`,
      videoId,
    );
    return {
      ...info,
      display_id: displayId ?? undefined,
      age_limit: 18,
    };
  }
}
