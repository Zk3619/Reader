/**
 * MonstercatIE — ported from yt-dlp monstercat.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, extract_attributes, int_or_none, unified_strdate } from '../../utils';
import { stripOrNone } from './_helpers';

export class MonstercatIE extends InfoExtractor {
  static IE_NAME = 'monstercat';
  static _VALID_URL = /https?:\/\/www\.monstercat\.com\/release\/(?<id>\d{12}|MC[A-Z]+\d+)/;

  protected *_extractTracks(table: string, albumMeta: Record<string, unknown>): Generator<VideoInfo> {
    for (const td of table.match(/<tr[^<]*>((?:(?!<\/tr>)[\s\S])+)/g) || []) {
      const titleMatch = td.match(/class="d-inline-flex flex-column"[^>]*>([\s\S]*?)<\/div>/i);
      const titleRaw = titleMatch?.[1]?.split('<span')[0] || '';
      const title = clean_html(titleRaw);

      const playMatch = td.match(/class="btn-play cursor-pointer mr-small"[^>]*>/i);
      const attrs = playMatch ? extract_attributes(playMatch[0]) : {};
      const trackId = attrs['data-track-id'];
      const releaseId = attrs['data-release-id'];
      const trackNumberMatch = td.match(/class="py-xsmall"[^>]*>([^<]+)</);
      const trackNumber = int_or_none(trackNumberMatch?.[1]?.trim() || '');

      if (!trackId || !releaseId) {
        this.report_warning(`Skipping track ${trackNumber}, ID(s) not found`);
        continue;
      }

      const artists = [...td.matchAll(/class="d-block fs-xxsmall"[^>]*>([^<]+)</gi)]
        .map((m) => clean_html(m[1]))
        .filter(Boolean) as string[];

      yield {
        ...(albumMeta as VideoInfo),
        title: title || undefined,
        track: title || undefined,
        track_number: trackNumber ?? undefined,
        artists,
        url: `https://www.monstercat.com/api/release/${releaseId}/track-stream/${trackId}`,
        id: trackId,
        ext: 'mp3',
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const urlId = this._match_id(url);
    const html = await this._download_webpage(url, urlId);
    const tracklistMatch = html.match(/class="table table-small"[^>]*>([\s\S]*?)<\/table>/i);
    const tracklistTable = tracklistMatch?.[1] || '';
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = clean_html(titleMatch?.[1] || '') || undefined;

    const albumMeta = {
      title,
      album: title,
      thumbnail: `https://www.monstercat.com/release/${urlId}/cover`,
      album_artists: [...html.matchAll(/class="h-normal text-uppercase mb-desktop-medium mb-smallish"[^>]*>([^<]+)</gi)]
        .map((m) => clean_html(m[1]))
        .filter(Boolean) as string[],
      release_date: (() => {
        const rel = html.match(/class="font-italic mb-medium d-tablet-none d-phone-block"[^>]*>([\s\S]*?)<\//i)?.[1];
        const part = rel?.split('Released ')[1];
        return part ? unified_strdate(stripOrNone(part)) || undefined : undefined;
      })(),
    };

    const entries = [...this._extractTracks(tracklistTable, albumMeta)];
    return this.playlist_result(entries, urlId, title, undefined);
  }
}
