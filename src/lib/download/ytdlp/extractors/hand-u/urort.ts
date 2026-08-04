// @ts-nocheck
/** UrortIE â€?ported from yt-dlp urort.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';

export class UrortIE extends InfoExtractor {
  static IE_NAME = 'urort';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/(?:www\.)?urort\.p3\.no\/#!\/Band\/(?<id>[^/]+)$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const fstr = encodeURIComponent(`InternalBandUrl eq '${playlistId}'`);
    const jsonUrl = `http://urort.p3.no/breeze/urort/TrackDTOViews?$filter=${fstr}&$orderby=Released%20desc&$expand=Tags%2CFiles`;
    const songs = await this._download_json<Array<Record<string, unknown>>>(jsonUrl, playlistId);

    const entries: VideoInfo[] = [];
    for (const s of songs || []) {
      const formats: Format[] = ((s.Files as Array<Record<string, unknown>>) || []).map((f) => ({
        tbr: f.Quality as number | undefined,
        ext: String(f.FileType || ''),
        format_id: `${f.FileType}-${f.Quality ?? ''}`,
        url: `http://p3urort.blob.core.windows.net/tracks/${f.FileRef}`,
        quality: f.FileType === 'mp3' ? 3 : 2,
      }));
      entries.push({
        id: `${s.BandId}-${s.$id}`,
        title: String(s.Title || ''),
        uploader_id: playlistId,
        uploader: (s.BandName as string) || playlistId,
        thumbnail: `http://urort.p3.no/cloud/images/${s.Image}`,
        upload_date: unified_strdate(s.Released) || undefined,
        formats,
      });
    }

    return this.playlist_result(entries, playlistId, playlistId);
  }
}
