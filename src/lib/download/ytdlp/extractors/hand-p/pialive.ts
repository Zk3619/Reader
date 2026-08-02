/** PiaLiveIE — ported from yt-dlp pialive.py (comments/upcoming simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, extract_attributes, get_element_by_class, unified_timestamp } from '../../utils';

function multipartEncode(fields: Record<string, string>): [string, string] {
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const body =
    Object.entries(fields)
      .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
      .join('') + `--${boundary}--\r\n`;
  return [body, `multipart/form-data; boundary=${boundary}`];
}

export class PiaLiveIE extends InfoExtractor {
  static IE_NAME = 'pialive';
  static _VALID_URL = /https?:\/\/player\.pia-live\.jp\/stream\/(?<id>[\w-]+)/;

  protected _extractVar(variable: string, html: string): string {
    return this._search_regex(
      new RegExp(`(?:var|const|let)\\s+${variable}\\s*=\\s*(["'])(?<value>(?:(?!\\1).)+)\\1`),
      html,
      `variable ${variable}`,
      null,
      true,
      'value',
    )!;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoKey = this._match_id(url);
    const webpage = await this._download_webpage(url, videoKey);
    const programCode = this._extractVar('programCode', webpage);
    const title =
      this._og_search_title(webpage) ||
      this._html_search_regex(/<title>(.+?)<\/title>/, webpage, 'title') ||
      programCode;

    if (get_element_by_class('play-end', webpage)) {
      throw new ExtractorError('The video is no longer available', { expected: true });
    }

    const startInfo = clean_html(get_element_by_class('play-waiting__date', webpage) || '');
    if (startInfo) {
      const m = /(\d{4}\/\d{1,2}\/\d{1,2})\([月火水木金土日]\)(\d{2}:\d{2})/.exec(startInfo);
      if (m) {
        const releaseTimestampStr = `${m[1]} ${m[2]} +09:00`;
        this.raise_no_formats(`The video will be available after ${releaseTimestampStr}`, true);
        return {
          id: programCode,
          title,
          live_status: 'is_upcoming',
          release_timestamp: unified_timestamp(releaseTimestampStr) ?? undefined,
        };
      }
    }

    const [payload, contentType] = multipartEncode({ play_url: videoKey, api_key: 'kfds)FKFps-dms9e' });
    const apiOpts = {
      data: payload,
      headers: { 'Content-Type': contentType, Referer: 'https://player.pia-live.jp/' },
    };

    const playerTagList = await this._download_json<{ data?: { movie_one_tag?: string } }>(
      `https://api.pia-live.jp/perf/player-tag-list/${programCode}`,
      programCode,
      'Fetching player tag list',
      apiOpts,
    );
    const embedUrl = extract_attributes(String(playerTagList.data?.movie_one_tag ?? '')).src;
    return {
      id: programCode,
      _type: 'url_transparent',
      url: embedUrl,
      title,
      display_id: programCode,
    };
  }
}
