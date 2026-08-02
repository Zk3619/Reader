/** Ruv* — ported from yt-dlp ruv.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, parse_duration, traverse_obj, unified_timestamp } from '../../utils';

const FIELD_RE = /video\.(src|poster)\s*=\s*(["'])(?<url>(?:(?!\2).)+)\2/;

export class RuvIE extends InfoExtractor {
  static IE_NAME = 'Ruv';
  static _VALID_URL = /https?:\/\/(?:www\.)?ruv\.is\/(?:sarpurinn\/[^/]+|node)\/(?<id>[^/]+(?:\/\d+)?)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const title = this._og_search_title(webpage) ?? undefined;
    const srcMatch = webpage.match(new RegExp(FIELD_RE.source.replace('(src|poster)', 'src')));
    const mediaUrl = srcMatch?.groups?.url;
    if (!mediaUrl) throw new Error('Unable to extract video URL');

    const videoId =
      this._search_regex(
        /<link\b[^>]+\bhref=["']https?:\/\/www\.ruv\.is\/node\/(\d+)/,
        webpage,
        'video id',
        displayId,
        false,
      ) || displayId;

    const ext = determine_ext(mediaUrl);
    let formats: Format[];
    if (ext === 'm3u8') {
      formats = await this._extract_m3u8_formats(mediaUrl, videoId, 'mp4', 'm3u8_native', 'hls');
    } else if (ext === 'mp3') {
      formats = [{ format_id: 'mp3', url: mediaUrl, vcodec: 'none', ext: 'mp3' }];
    } else {
      formats = [{ url: mediaUrl, format_id: ext || 'http' }];
    }

    const posterMatch = webpage.match(new RegExp(FIELD_RE.source.replace('(src|poster)', 'poster')));
    return {
      id: videoId,
      display_id: displayId,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail:
        this._og_search_thumbnail(webpage) ||
        posterMatch?.groups?.url ||
        undefined,
      timestamp:
        unified_timestamp(
          this._html_search_meta('article:published_time', webpage, 'timestamp', false) || undefined,
        ) ?? undefined,
      formats,
    };
  }
}

export class RuvSpilaIE extends InfoExtractor {
  static IE_NAME = 'ruv.is:spila';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ruv\.is\/(?:(?:sjon|ut)varp|(?:krakka|ung)ruv)\/spila\/.+\/(?<series_id>[0-9]+)\/(?<id>[a-z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const seriesId = m.groups!.series_id!;
    const resp = await this._download_json<{ data?: { Program?: Record<string, unknown> } }>(
      'https://www.ruv.is/gql/',
      displayId,
      undefined,
      {
        query: {
          query: `{
                Program(id: ${seriesId}){
                    title image description short_description
                    episodes(id: {value: "${displayId}"}) {
                        rating title duration file image firstrun description
                        clips { time text }
                        subtitles { name value }
                    }
                }
            }`,
        },
      },
    );
    const program = resp.data?.Program || {};
    const episodes = (program.episodes as Array<Record<string, unknown>>) || [];
    const episode = episodes[0] || {};

    const subs: Record<string, Array<{ url: string; ext: string }>> = {};
    for (const trk of (episode.subtitles as Array<Record<string, unknown>>) || []) {
      if (trk.name && trk.value) {
        (subs[String(trk.name)] ||= []).push({ url: String(trk.value), ext: 'vtt' });
      }
    }

    const mediaUrl = episode.file as string;
    let formats: Format[];
    if (determine_ext(mediaUrl) === 'm3u8') {
      formats = await this._extract_m3u8_formats(mediaUrl, displayId);
    } else {
      formats = [{ url: mediaUrl, format_id: determine_ext(mediaUrl) || 'http' }];
    }

    const clips = ((episode.clips as Array<Record<string, unknown>>) || []).map((c) => ({
      start_time: parse_duration(String(c.time || '')) ?? undefined,
      title: c.text as string | undefined,
    }));

    const image = String(episode.image || '').replace('$$IMAGESIZE$$', '1960');

    return {
      id: displayId,
      title: traverse_obj(program, ['episodes', 0, 'title']) as string | undefined || (program.title as string),
      description:
        (traverse_obj(program, ['episodes', 0, 'description']) as string) ||
        (program.description as string) ||
        (program.short_description as string) ||
        undefined,
      subtitles: subs,
      thumbnail: image || undefined,
      timestamp: unified_timestamp(episode.firstrun as string) ?? undefined,
      formats,
      age_limit: episode.rating as number | undefined,
      chapters: clips,
    };
  }
}
