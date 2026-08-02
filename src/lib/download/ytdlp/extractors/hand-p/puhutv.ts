/** PuhuTVIE / PuhuTVSerieIE — ported from yt-dlp puhutv.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { parse_resolution, urljoin } from './_helpers';

const SUBTITLE_LANGS: Record<string, string> = {
  English: 'en',
  Deutsch: 'de',
  'عربى': 'ar',
};

export class PuhuTVIE extends InfoExtractor {
  static IE_NAME = 'puhutv';
  static _VALID_URL = /https?:\/\/(?:www\.)?puhutv\.com\/(?<id>[^/?#&]+)-izle/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const info = (
      await this._download_json<{ data?: Record<string, unknown> }>(urljoin(url, `/api/slug/${displayId}-izle`), displayId)
    ).data || {};
    const videoId = String(info.id ?? displayId);
    const show = (info.title as Record<string, unknown>) || {};
    let title = str_or_none(info.name) || str_or_none(show.name) || displayId;
    if (info.display_name) title = `${title} ${info.display_name}`;

    let videos: { data?: { videos?: Array<Record<string, unknown>> } };
    try {
      videos = await this._download_json(
        `https://puhutv.com/api/assets/${videoId}/videos`,
        displayId,
        'Downloading video JSON',
        { headers: this.geo_verification_headers() },
      );
    } catch (e) {
      if ((e as { status?: number }).status === 403) this.raise_geo_restricted();
      throw e;
    }

    const seen = new Set<string>();
    const formats: Format[] = [];
    for (const video of videos.data?.videos || []) {
      const mediaUrl = url_or_none(video.url);
      if (!mediaUrl || seen.has(mediaUrl)) continue;
      seen.add(mediaUrl);
      const playlist = video.is_playlist;
      if ((video.stream_type === 'hls' && playlist === true) || mediaUrl.includes('playlist.m3u8')) {
        formats.push(
          ...(await this._extract_m3u8_formats(mediaUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
        continue;
      }
      const quality = int_or_none(video.quality);
      const videoFormat = video.video_format as string | undefined;
      const isHls =
        videoFormat === 'hls' || mediaUrl.includes('/hls/') || mediaUrl.includes('/chunklist.m3u8');
      let formatId: string;
      if (isHls && playlist === false) formatId = 'hls';
      else if (videoFormat === 'mp4') formatId = 'http';
      else continue;
      if (quality) formatId += `-${quality}p`;
      formats.push({
        url: mediaUrl,
        ext: 'mp4',
        height: quality ?? undefined,
        format_id: formatId,
        protocol: isHls && playlist === false ? 'm3u8_native' : undefined,
      });
    }

    const content = (info.content as Record<string, unknown>) || {};
    const images = ((content.images as Record<string, unknown>)?.wide as Record<string, string>) || {};
    const thumbnails = Object.entries(images)
      .filter(([, u]) => typeof u === 'string')
      .map(([id, u]) => {
        const imageUrl = u.startsWith('http') || u.startsWith('//') ? (u.startsWith('//') ? `https:${u}` : u) : `https://${u}`;
        return { ...parse_resolution(id), id, url: imageUrl };
      });

    const tags = ((show.genres as Array<{ name?: string }>) || []).map((g) => g.name).filter(Boolean) as string[];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const subtitle of (content.subtitles as Array<Record<string, unknown>>) || []) {
      const lang = subtitle.language as string | undefined;
      const subUrl = url_or_none(subtitle.url) || url_or_none(subtitle.file);
      if (!lang || !subUrl) continue;
      const code = SUBTITLE_LANGS[lang] || lang;
      (subtitles[code] ||= []).push({ url: subUrl, ext: 'vtt' });
    }

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: str_or_none(info.description) || str_or_none(show.description) || undefined,
      season_id: str_or_none(info.season_id) ?? undefined,
      season_number: int_or_none(info.season_number) ?? undefined,
      episode_number: int_or_none(info.episode_number) ?? undefined,
      release_year: int_or_none(show.released_at) ?? undefined,
      timestamp: unified_timestamp(info.created_at) ?? undefined,
      creator: traverse_obj(show, ['producer', 'name']) as string | undefined,
      view_count: int_or_none(content.watch_count) ?? undefined,
      duration: float_or_none(content.duration_in_ms, 1000) ?? undefined,
      tags,
      subtitles,
      thumbnails,
      formats,
    };
  }
}

export class PuhuTVSerieIE extends InfoExtractor {
  static IE_NAME = 'puhutv:serie';
  static _VALID_URL = /https?:\/\/(?:www\.)?puhutv\.com\/(?<id>[^/?#&]+)-detay/;

  protected async *_extractEntries(seasons: Array<Record<string, unknown>>): AsyncGenerator<VideoInfo> {
    for (const season of seasons) {
      const seasonId = season.id;
      if (!seasonId) continue;
      for (let page = 1; ; page++) {
        const seasonData = (
          await this._download_json<{ data?: Record<string, unknown> }>(
            `https://appservice.puhutv.com/api/seasons/${seasonId}/episodes?v=2`,
            String(seasonId),
            `Downloading page ${page}`,
            { query: { page: String(page), per: '100' } },
          )
        ).data || {};
        for (const episode of (seasonData.episodes as Array<Record<string, unknown>>) || []) {
          const slug = (episode.slug as string) || ((episode.assets as Array<Record<string, unknown>>)?.[0]?.slug as string);
          if (!slug) continue;
          yield this.url_result(`https://puhutv.com/${slug}`, 'PuhuTV', episode.id as string | undefined, episode.name as string | undefined);
        }
        if (!seasonData.has_more) break;
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const info = (
      await this._download_json<{ data?: Record<string, unknown> }>(
        urljoin(url, `/api/slug/${playlistId}-detay`),
        playlistId,
      )
    ).data || {};
    const seasons = info.seasons as Array<Record<string, unknown>> | undefined;
    if (seasons?.length) {
      const entries: VideoInfo[] = [];
      for await (const e of this._extractEntries(seasons)) entries.push(e);
      return this.playlist_result(entries, playlistId, info.name as string | undefined);
    }
    let videoId = str_or_none(info.slug)?.replace(/-detay$/, '');
    if (!videoId) videoId = str_or_none((info.assets as Array<Record<string, unknown>>)?.[0]?.slug)?.replace(/-izle$/, '');
    return this.url_result(`https://puhutv.com/${videoId}-izle`, 'PuhuTV', videoId ?? undefined);
  }
}
