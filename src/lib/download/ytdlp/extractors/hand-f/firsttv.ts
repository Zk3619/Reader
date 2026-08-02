/**
 * FirstTVIE / FirstTVLiveIE ??ported from yt-dlp firsttv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  mimetype2ext,
  parse_qs,
  traverse_obj,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, mergeSubtitles, urljoin } from './_helpers';

export class FirstTVIE extends InfoExtractor {
  static IE_NAME = '1tv';
  static IE_DESC = 'First channel (1tv.ru)';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?:sport)?1tv\.ru\/(?:[^/?#]+\/)+(?<id>[^/?#]+)/;

  protected async *_entries(items: Record<string, unknown>[]): AsyncGenerator<VideoInfo> {
    for (const item of items) {
      const videoId = String(item.id ?? item.uid ?? '');
      const formats: Format[] = [];
      const subtitles: Record<string, Subtitle[]> = {};
      const sources = traverse_obj(item, ['sources'], { get_all: true }) as Record<string, unknown>[];
      for (const f of sources || []) {
        const src = url_or_none(f.src);
        if (!src) continue;
        const ext = mimetype2ext(String(f.type ?? '')) || determine_ext(src);
        if (ext === 'm3u8') {
          const res = await extractM3u8FormatsAndSubtitles(this, src, videoId, 'hls');
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else if (ext === 'mpd') {
          formats.push(...(await this._extract_mpd_formats(src, videoId, 'dash', undefined, false)));
        } else {
          const tbrMatch = new RegExp(`_(\\d{3,})\\.${ext}`).exec(src);
          formats.push({
            url: src,
            ext,
            format_id: join_nonempty('http', ext, tbrMatch?.[1]),
            tbr: int_or_none(tbrMatch?.[1]) ?? undefined,
            quality: -10,
          });
        }
      }

      yield {
        id: videoId,
        title: traverse_obj(item, ['title', String]) as string | undefined,
        thumbnail: traverse_obj(item, ['poster', url_or_none]) as string | undefined,
        timestamp: int_or_none(item.dvr_begin_at) ?? undefined,
        upload_date: unified_strdate(item.date_air) ?? undefined,
        duration: int_or_none(item.duration) ?? undefined,
        formats,
        subtitles,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const playlistUrl = urljoin(
      url,
      this._html_search_regex(/data-playlist-url=(["'])(?<url>(?:(?!\1).)+)\1/, webpage, 'playlist url', 'url')!,
    );

    const itemIds = [
      ...(parse_qs(playlistUrl).video_id || []),
      ...(parse_qs(playlistUrl)['videos_ids[]'] || []),
      ...(parse_qs(playlistUrl)['news_ids[]'] || []),
    ];
    const json = await this._download_json<Record<string, unknown>[] | Record<string, unknown>>(
      playlistUrl,
      displayId,
    );
    const list = Array.isArray(json) ? json : Object.values(json);
    const items = list.filter((v) => {
      if (!v || typeof v !== 'object') return false;
      const uid = String((v as Record<string, unknown>).uid ?? '');
      return uid && (itemIds.length ? itemIds.includes(uid) : true);
    }) as Record<string, unknown>[];

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(items)) entries.push(entry);

    return this.playlist_result(
      entries,
      displayId,
      this._og_search_title(webpage, false) ?? undefined,
    );
  }
}

export class FirstTVLiveIE extends InfoExtractor {
  static IE_NAME = '1tv:live';
  static IE_DESC = 'First channel live (1tv.ru)';
  static _VALID_URL = /https?:\/\/(?:www\.)?1tv\.ru\/live/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = 'live';
    const webpage = await this._download_webpage(url, displayId, undefined, { fatal: false });
    const streamsList = await this._download_json<Record<string, unknown>>(
      'https://stream.1tv.ru/api/playlist/1tvch-v1_as_array.json',
      displayId,
    );
    const mpdCandidates = (streamsList.mpd as unknown[]) || [];
    let mpdUrl: string | null = null;
    for (const item of mpdCandidates) {
      const u = url_or_none(item);
      if (u) {
        mpdUrl = u;
        break;
      }
    }
    if (!mpdUrl) throw new Error('mpd url not found');

    const formats = await this._extract_mpd_formats(mpdUrl, displayId, 'dash', undefined, false);
    return {
      id: displayId,
      title: htmlExtractTitle(webpage || '') || displayId,
      formats,
      is_live: true,
    };
  }
}
