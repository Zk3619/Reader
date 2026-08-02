/**
 * NekoHackerIE — ported from yt-dlp nekohacker.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  get_element_by_class,
  parse_duration,
  url_or_none,
} from '../../utils';

export class NekoHackerIE extends InfoExtractor {
  static IE_NAME = 'nekohacker';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?nekohacker\.com\/(?<id>(?!free-dl)[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const playlist = get_element_by_class('playlist', webpage);

    if (!playlist) {
      const iframeMatch = webpage.match(/<iframe[^>]+>/i);
      const iframeSrc = iframeMatch
        ? url_or_none(extract_attributes(iframeMatch[0]!).src)
        : null;
      if (!iframeSrc) throw new ExtractorError('No playlist or embed found in webpage');
      if (/https?:\/\/(?:\w+\.)?spotify\.com\//i.test(iframeSrc)) {
        throw new ExtractorError('Spotify embeds are not supported', { expected: true });
      }
      return this.url_result(url, 'Generic') as VideoInfo;
    }

    const playerParams =
      this._search_json<Record<string, unknown>>(
        /var srp_player_params_[\da-f]+\s*=/,
        webpage,
        'player params',
        playlistId,
        { fatal: false },
      ) || {};

    const entries: VideoInfo[] = [];
    let trackNumber = 0;
    for (const track of playlist.match(/<li[^>]+data-audiopath[^>]+>/gim) || []) {
      trackNumber++;
      const attrs = extract_attributes(track);
      const audioPath = url_or_none(attrs['data-audiopath']);
      const entry: VideoInfo = {
        url: audioPath || undefined,
        ext: audioPath ? determine_ext(audioPath) : undefined,
        id: attrs['data-trackid'] || String(trackNumber),
        title: attrs['data-tracktitle'] || undefined,
        track: attrs['data-tracktitle'] || undefined,
        album: attrs['data-albumtitle'] || undefined,
        duration: parse_duration(attrs['data-tracktime']) ?? undefined,
        release_date: attrs['data-releasedate']?.replace(/\./g, '').match(/\d{8}/)?.[0],
        thumbnail: url_or_none(playerParams.artwork) ?? undefined,
        track_number: trackNumber,
        artists: ['Neko Hacker'],
        vcodec: 'none',
        acodec: audioPath && determine_ext(audioPath) === 'mp3' ? 'mp3' : undefined,
      };
      entries.push(entry);
    }

    return this.playlist_result(entries, playlistId, entries[0]?.album as string | undefined);
  }
}
