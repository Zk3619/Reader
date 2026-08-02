/**
 * LearningOnScreenIE — ported from yt-dlp learningonscreen.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, join_nonempty, parse_duration, unified_timestamp } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class LearningOnScreenIE extends InfoExtractor {
  static IE_NAME = 'learningonscreen';
  static _VALID_URL = /https?:\/\/learningonscreen\.ac\.uk\/ondemand\/index\.php\/prog\/(?<id>\w+)/;

  async _real_initialize(): Promise<void> {
    const cookies = this._get_cookies('https://learningonscreen.ac.uk/');
    if (!cookies['PHPSESSID-LOS-LIVE']) {
      this.raise_login_required(undefined, undefined, 'session_cookies');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const detailsMatch = webpage.match(/id="programme-details"[\s\S]*?<\/div>/i);
    const detailsBlock = detailsMatch?.[0] || '';
    const titleMatch = detailsBlock.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const dateMatch = detailsBlock.match(/class="broadcast-date"[^>]*>([\s\S]*?)<\//i);
    const durationMatch = detailsBlock.match(/class="prog-running-time"[^>]*>([\s\S]*?)<\//i);

    let title = titleMatch ? clean_html(titleMatch[1]) : null;
    const timestamp = dateMatch
      ? unified_timestamp((dateMatch[1] || '').replace(/<[^>]+>/g, '').trim())
      : null;
    const duration = durationMatch ? parse_duration(clean_html(durationMatch[1])) : null;

    if (!title) {
      const alt = webpage.match(/id="add-to-existing-playlist"[\s\S]*?data-record-title="([^"]+)"/i);
      title = alt ? clean_html(alt[1]) : null;
    }

    const entries = await parseHtml5MediaEntries(this, 'https://stream.learningonscreen.ac.uk', webpage, videoId, {
      m3u8Id: 'hls',
    });
    if (!entries.length) {
      throw new ExtractorError('No video found');
    }

    const common = {
      title: title || undefined,
      timestamp: timestamp ?? undefined,
      duration: duration ?? undefined,
    };

    if (entries.length > 1) {
      const playlistEntries = entries.map((entry, idx) => ({
        ...entry,
        ...common,
        id: join_nonempty(videoId, String(idx + 1)),
        title: join_nonempty(title, String(idx + 1)),
      }));
      return this.playlist_result(playlistEntries, videoId, title || videoId);
    }

    return {
      ...entries[0]!,
      ...common,
      id: videoId,
      title: title || videoId,
    };
  }
}
