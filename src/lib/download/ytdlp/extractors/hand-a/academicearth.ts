/**
 * AcademicEarthCourseIE — aligned with yt-dlp academicearth.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class AcademicEarthCourseIE extends InfoExtractor {
  static IE_NAME = 'AcademicEarth:Course';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?academicearth\.org\/playlists\/(?<id>[^?#/]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const title =
      this._html_search_regex(
        /<h1 class="playlist-name"[^>]*?>(.*?)<\/h1>/,
        webpage,
        'title',
      ) || playlistId;
    const description = this._html_search_regex(
      /<p class="excerpt"[^>]*?>(.*?)<\/p>/,
      webpage,
      'description',
      null,
      false,
    );
    const urls = [
      ...webpage.matchAll(
        /<li class="lecture-preview">\s*?<a target="_blank" href="([^"]+)">/g,
      ),
    ].map((m) => m[1]!);

    return this.playlist_result(
      urls.map((u) => this.url_result(u)),
      playlistId,
      title,
      description,
    );
  }
}
