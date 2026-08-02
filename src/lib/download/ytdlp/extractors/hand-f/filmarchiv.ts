/**
 * FilmArchivIE ??ported from yt-dlp filmarchiv.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class FilmArchivIE extends InfoExtractor {
  static IE_DESC = 'FILMARCHIV ON';
  static IE_NAME = 'filmarchiv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?filmarchiv\.at\/de\/filmarchiv-on\/video\/(?<id>f_[0-9a-zA-Z]{5,})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const webpage = await this._download_webpage(url, mediaId);
    const path = `${mediaId.slice(0, 6)}/${mediaId.slice(6)}`;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `https://cdn.filmarchiv.at/${path}_v1_sv1/playlist.m3u8`,
      mediaId,
    );

    const titleMatch = webpage.match(/<title-div[^>]*>([\s\S]*?)<\/title-div>/i);
    const title = titleMatch ? clean_html(titleMatch[1]) : mediaId;
    const descMatch = webpage.match(
      /<div[^>]*class="[^"]*\bborder-base-content\b[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*\bprose\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );

    return {
      id: mediaId,
      title: title || mediaId,
      description: descMatch ? clean_html(descMatch[1]) ?? undefined : undefined,
      thumbnail: `https://cdn.filmarchiv.at/${path}_v1/poster.jpg`,
      formats,
      subtitles,
    };
  }
}
