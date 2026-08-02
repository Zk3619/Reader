/** TeacherTubeIE / TeacherTubeUserIE — ported from yt-dlp teachertube.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext } from '../../utils';
import { qualityRank } from './_helpers';

const MEDIA_QUALITY = qualityRank(['mp3', 'flv', 'mp4']);
const TITLE_SUFFIX = ' - TeacherTube';
const MEDIA_RE =
  /class="?sidebar_thumb_time"?>[0-9:]+<\/div>\s*<a\s+href="(https?:\/\/(?:www\.)?teachertube\.com\/(?:video|audio)\/[^"]+)"/;

export class TeacherTubeIE extends InfoExtractor {
  static IE_NAME = 'teachertube';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?teachertube\.com\/(?:viewVideo\.php\?video_id=|music\.php\?music_id=|video\/(?:[\da-z-]+-)?|audio\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const error = this._search_regex(/<div\b[^>]+\bclass=["']msgBox error[^>]+>([^<]+)/, webpage, 'error', null, false);
    if (error) throw new ExtractorError(`${TeacherTubeIE.IE_NAME} said: ${error}`, { expected: true });

    let title = this._html_search_meta('title', webpage, 'title')!;
    if (title.endsWith(TITLE_SUFFIX)) title = title.slice(0, -TITLE_SUFFIX.length).trim();

    let description = this._html_search_meta('description', webpage, 'description');
    if (description) description = description.trim();

    const mediaUrls = [
      ...webpage.matchAll(/data-contenturl="([^"]+)"/g),
      ...webpage.matchAll(/var\s+filePath\s*=\s*"([^"]+)"/g),
      ...webpage.matchAll(/'file'\s*:\s*["']([^"']+)["']/g),
    ].map((m) => m[1]!);

    const formats: Format[] = [...new Set(mediaUrls)].map((mediaUrl) => ({
      url: mediaUrl,
      format_id: determine_ext(mediaUrl) || 'http',
      quality: MEDIA_QUALITY(determine_ext(mediaUrl)),
    }));

    return {
      id: videoId,
      title,
      description: description ?? undefined,
      thumbnail:
        this._og_search_thumbnail(webpage) ||
        this._html_search_meta('thumbnail', webpage, 'thumbnail') ||
        undefined,
      formats,
    };
  }
}

export class TeacherTubeUserIE extends InfoExtractor {
  static IE_NAME = 'teachertube:user';
  static _VALID_URL = /https?:\/\/(?:www\.)?teachertube\.com\/(?:user\/profile|collection)\/(?<user>[0-9a-zA-Z]+)\/?/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const userId = this._match_valid_url(url)!.groups!.user!;
    const urls: string[] = [];
    const webpage = await this._download_webpage(url, userId);
    urls.push(...[...webpage.matchAll(new RegExp(MEDIA_RE.source, 'g'))].map((m) => m[1]!));

    const pages = [...webpage.matchAll(new RegExp(`/ajax-user/user-videos/${userId}\\?page=([0-9]+)`, 'g'))]
      .map((m) => m[1]!)
      .slice(0, -1);
    for (const p of pages) {
      const more = `http://www.teachertube.com/ajax-user/user-videos/${userId}?page=${p}`;
      const pageHtml = await this._download_webpage(more, userId, `Downloading page ${p}/${pages.length}`);
      urls.push(...[...pageHtml.matchAll(new RegExp(MEDIA_RE.source, 'g'))].map((m) => m[1]!));
    }

    return this.playlist_result(
      urls.map((vurl) => this.url_result(vurl, 'TeacherTube')),
      userId,
    );
  }
}
