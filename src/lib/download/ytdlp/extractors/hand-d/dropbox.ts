/**
 * DropboxIE — ported from yt-dlp dropbox.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { update_url_query } from '../../utils';
import { urlBasename, urlencodePostdata } from './_helpers';

function decodePrefetchParts(webpage: string): string[] {
  const parts: string[] = [];
  const matches = [...webpage.matchAll(/registerStreamedPrefetch\s*\(\s*"[\w/+=]+"\s*,\s*"([\w/+=]+)"/g)];
  for (const m of matches.reverse()) {
    try {
      parts.push(atob(m[1]!));
    } catch {
      /* skip */
    }
  }
  return parts;
}

export class DropboxIE extends InfoExtractor {
  static IE_NAME = 'dropbox';
  static _VALID_URL = /https?:\/\/(?:www\.)?dropbox\.com\/(?:(?:e\/)?scl\/f[io]|sh?)\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_valid_url(url)!.groups!.id!;
    let webpage = await this._download_webpage(url, videoId);
    const fn = decodeURIComponent(urlBasename(url));
    const title = fn.replace(/\.[^.]+$/, '');
    let contentId: string | null = null;

    for (const part of decodePrefetchParts(webpage)) {
      if (part.includes('/sm/password')) {
        contentId = this._search_regex(/content_id=([\w.+=/-]+)/, part, 'content ID', null, false);
        if (contentId) break;
      }
    }

    if (contentId) {
      const password = this.params.videopassword as string | undefined;
      if (!password) {
        throw new ExtractorError('Password protected video, use --video-password <password>', { expected: true });
      }
      const cookies = await this._get_cookies('https://www.dropbox.com');
      const tCookie = cookies.t || '';
      const response = await this._download_json<{ status?: string }>(
        'https://www.dropbox.com/sm/auth',
        videoId,
        'POSTing video password',
        {
          data: urlencodePostdata({
            is_xhr: 'true',
            t: tCookie || '',
            content_id: contentId,
            password,
            url: url.replace(/^https?:\/\/[^/]+/, ''),
          }),
          method: 'POST',
        },
      );
      if (response.status !== 'authed') {
        throw new ExtractorError('Invalid password', { expected: true });
      }
      webpage = await this._download_webpage(url, videoId);
    }

    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    let hasAnonymousDownload = false;
    let thumbnail: string | undefined;

    for (const part of decodePrefetchParts(webpage)) {
      if (!hasAnonymousDownload) {
        hasAnonymousDownload = !!this._search_regex(/(anonymous:\tanonymous)/, part, 'anonymous', null, false);
      }
      const transcodeUrl = this._search_regex(/\n.?(https:\/\/[^\x03\x08\x12\n]+\.m3u8)/, part, 'transcode url', null, false);
      if (!transcodeUrl) continue;
      const fmts = await this._extract_m3u8_formats(transcodeUrl, videoId, 'mp4', 'm3u8_native');
      formats = fmts;
      thumbnail =
        this._search_regex(
          /(https:\/\/www\.dropbox\.com\/temp_thumb_from_token\/[\w/?&=]+)/,
          part,
          'thumbnail',
          null,
          false,
        ) ?? undefined;
      break;
    }

    if (hasAnonymousDownload) {
      formats.push({
        url: update_url_query(url, { dl: '1' }),
        format_id: 'original',
        format_note: 'Original',
        quality: 1,
      });
    }

    return { id: videoId, title, formats, subtitles, thumbnail };
  }
}
