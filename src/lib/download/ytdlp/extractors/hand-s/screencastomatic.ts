/** ScreencastOMaticIE — ported from yt-dlp screencastomatic.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, remove_start, unified_strdate, get_element_by_class } from '../../utils';
import { stripOrNone, urlencodePostdata } from './_helpers';

function parseHtml5Media(webpage: string): Partial<VideoInfo> {
  const formats: Format[] = [];
  for (const m of webpage.matchAll(/<source[^>]+src=(["'])([^"']+)\1[^>]*>/gi)) {
    formats.push({ url: m[2]!, format_id: `http-${formats.length}` });
  }
  return { formats };
}

export class ScreencastOMaticIE extends InfoExtractor {
  static IE_NAME = 'screencastomatic';
  static _VALID_URL =
    /https?:\/\/screencast-o-matic\.com\/(?:(?:watch|player)\/|embed\?.*?\bsc=)(?<id>[0-9a-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let webpage = await this._download_webpage(`https://screencast-o-matic.com/player/${videoId}`, videoId);

    if (
      get_element_by_class('overlayTitle', webpage) === 'Protected Content' ||
      webpage.includes('This video is private and requires a password')
    ) {
      const password = this.params.videopassword;
      if (!password) {
        throw new ExtractorError('Password protected video, use --video-password <password>', { expected: true });
      }
      const form = this._search_regex(/<form[^>]*>(?<form>[\s\S]+?)<\/form>/i, webpage, 'login form', undefined, true, 'form')!;
      const formData: Record<string, string> = {};
      for (const m of form.matchAll(/<input[^>]+name=(["'])([^"']+)\1[^>]+value=(["'])([^"']*)\3/gi)) {
        formData[m[2]!] = m[4]!;
      }
      formData.scPassword = String(password);
      webpage = await this._download_webpage(
        'https://screencast-o-matic.com/player/password',
        videoId,
        'Logging in',
        { method: 'POST', data: urlencodePostdata(formData) },
      );
      if (webpage.includes('<small class="text-danger">Invalid password</small>')) {
        throw new ExtractorError('Unable to login: Invalid password', { expected: true });
      }
    }

    const info = parseHtml5Media(webpage);
    return {
      ...info,
      id: videoId,
      title: get_element_by_class('overlayTitle', webpage) || videoId,
      description: stripOrNone(get_element_by_class('overlayDescription', webpage)) || undefined,
      duration:
        int_or_none(
          this._search_regex(/player\.duration\s*=\s*function\(\)\s*{\s*return\s+(\d+);\s*};/, webpage, 'duration', null, false),
        ) ?? undefined,
      upload_date:
        unified_strdate(remove_start(get_element_by_class('overlayPublished', webpage) || '', 'Published: ')) ?? undefined,
    };
  }
}
