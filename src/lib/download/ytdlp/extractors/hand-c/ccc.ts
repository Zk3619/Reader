/** media.ccc.de — ported from yt-dlp ccc.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class CCCIE extends InfoExtractor {
  static IE_NAME = 'media.ccc.de';
  static _VALID_URL = /^https?:\/\/(?:www\.)?media\.ccc\.de\/v\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const eventId = this._search_regex(/data-id=(['"])(?<event_id>\d+)\1/, webpage, 'event id', undefined, true, 'event_id')!;
    const eventData = await this._download_json<Record<string, unknown>>(
      `https://media.ccc.de/public/events/${eventId}`,
      eventId,
    );

    const formats: Format[] = [];
    for (const recording of (eventData.recordings as Record<string, unknown>[]) || []) {
      const recordingUrl = recording?.recording_url as string | undefined;
      if (!recordingUrl) continue;
      const language = (recording.language as string | undefined) || undefined;
      const folder = (recording.folder as string | undefined) || '';
      let formatId: string | undefined;
      if (language) formatId = language;
      if (folder) formatId = formatId ? `${formatId}-${folder}` : folder;
      const vcodec = folder.includes('h264') ? 'h264' : folder === 'mp3' || folder === 'opus' ? 'none' : undefined;
      const sizeMb = int_or_none(recording.size);
      formats.push({
        format_id: formatId || 'default',
        url: recordingUrl,
        width: int_or_none(recording.width) ?? undefined,
        height: int_or_none(recording.height) ?? undefined,
        filesize: sizeMb != null ? sizeMb * 1024 * 1024 : undefined,
        language,
        vcodec,
      });
    }

    const persons = eventData.persons as string[] | undefined;

    return {
      id: eventId,
      display_id: displayId,
      title: String(eventData.title || ''),
      creator: Array.isArray(persons) ? persons.join(', ') : undefined,
      description: (eventData.description as string) || undefined,
      thumbnail: (eventData.thumb_url as string) || undefined,
      timestamp: parseIso8601(eventData.date as string | undefined) ?? undefined,
      duration: int_or_none(eventData.length) ?? undefined,
      view_count: int_or_none(eventData.view_count) ?? undefined,
      tags: (eventData.tags as string[]) || undefined,
      formats,
    };
  }
}

export class CCCPlaylistIE extends InfoExtractor {
  static IE_NAME = 'media.ccc.de:lists';
  static _VALID_URL = /^https?:\/\/(?:www\.)?media\.ccc\.de\/c\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const conf = await this._download_json<Record<string, unknown>>(
      `https://media.ccc.de/public/conferences/${playlistId}`,
      playlistId,
    );

    const entries: VideoInfo[] = [];
    for (const e of (conf.events as Record<string, unknown>[]) || []) {
      const eventUrl = e?.frontend_link as string | undefined;
      if (eventUrl) entries.push(this.url_result(eventUrl, 'CCC'));
    }

    return this.playlist_result(entries, playlistId, (conf.title as string) || undefined);
  }
}
