/**
 * TVPlayIE / TVPlayHomeIE — ported from yt-dlp tvplay.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  try_get,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601, urljoin } from './_helpers';

export class TVPlayIE extends InfoExtractor {
  static IE_NAME = 'mtg';
  static IE_DESC = 'MTG services';
  static _VALID_URL =
    /(?:mtg:|https?:\/\/(?:www\.)?(?:tvplay(?:\.skaties)?\.lv(?:\/parraides)?|(?:tv3play|play\.tv3)\.lt(?:\/programos)?|tv3play(?:\.tv3)?\.ee\/sisu)\/(?:[^/]+\/)+)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    void this._search_regex(/https?:\/\/[^/]+\.([a-z]{2})/, url, 'geo country', null, false, 1);

    const video = await this._download_json<Record<string, unknown>>(
      `http://playapi.mtgx.tv/v3/videos/${videoId}`,
      videoId,
    );
    const streams = await this._download_json<{ streams?: Record<string, string> }>(
      `http://playapi.mtgx.tv/v3/videos/stream/${videoId}`,
      videoId,
    );

    const formats: Format[] = [];
    for (const [formatId, videoUrlRaw] of Object.entries(streams.streams || {})) {
      const videoUrl = url_or_none(videoUrlRaw);
      if (!videoUrl) continue;
      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      } else if (ext !== 'f4m') {
        const fmt: Format = { format_id: formatId, ext };
        if (videoUrl.startsWith('rtmp')) {
          const m = videoUrl.match(/^(?<url>rtmp:\/\/[^/]+\/(?<app>[^/]+))\/(?<playpath>.+)$/);
          if (!m?.groups) continue;
          Object.assign(fmt, {
            ext: 'flv',
            url: m.groups.url,
            app: m.groups.app,
            play_path: m.groups.playpath,
            preference: -1,
          });
        } else {
          fmt.url = videoUrl;
        }
        formats.push(fmt);
      }
    }

    if (!formats.length && video.is_geo_blocked) {
      this.raise_geo_restricted('This content might not be available in your country due to copyright reasons');
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const samiPath = video.sami_path != null ? String(video.sami_path) : '';
    if (samiPath) {
      const lang =
        this._search_regex(/_([a-z]{2})\.xml/, samiPath, 'lang', null, false, 1) ||
        new URL(url).hostname.split('.').pop() ||
        'und';
      subtitles[lang] = [{ url: samiPath, ext: 'xml' }];
    }

    const embedded = (video._embedded as Record<string, Record<string, unknown>>) || {};
    const seasonObj = embedded.season || {};
    const formatPos = (video.format_position as Record<string, unknown>) || {};

    return {
      id: videoId,
      title: String(video.title || videoId),
      description: video.description != null ? String(video.description) : undefined,
      series: video.format_title != null ? String(video.format_title) : undefined,
      episode_number: int_or_none(formatPos.episode) ?? undefined,
      season: seasonObj.title != null ? String(seasonObj.title) : undefined,
      season_number: int_or_none(formatPos.season) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      timestamp: parseIso8601(video.created_at) ?? undefined,
      view_count: try_get(video, (x) => (x.views as Record<string, unknown>).total as number) ?? undefined,
      age_limit: int_or_none(video.age_limit ?? 0) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class TVPlayHomeIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/(?:tv3?)?play\.(?:tv3|skaties)\.(?<country>lv|lt|ee)\/(?<live>lives\/)?[^?#&]+(?:episode|programme|clip)-(?<id>\d+)/;

  protected _resolveTitle(data: Record<string, unknown>): string {
    const season = (data.season as Record<string, Record<string, unknown>>) || {};
    const serial = season.serial || {};
    if (season.number != null && data.episode != null && serial.title != null && serial.year != null) {
      return `${serial.title} (${serial.year}) | S${String(season.number).padStart(2, '0')}E${String(data.episode).padStart(2, '0')}: ${data.title}`;
    }
    return String(data.title || data.id || 'video');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const country = m.groups!.country!;
    const isLive = !!m.groups!.live;
    const videoId = m.groups!.id!;

    const apiPath = isLive ? 'lives/programmes' : 'vods';
    const data = await this._download_json<Record<string, unknown>>(
      urljoin(url, `/api/products/${apiPath}/${videoId}?platform=BROWSER&lang=${country.toUpperCase()}`),
      videoId,
    );

    const videoType = isLive ? 'CATCHUP' : 'MOVIE';
    const streamId = isLive ? String(data.programRecordingId || videoId) : videoId;
    const stream = await this._download_json<{ sources: { HLS: Array<{ src: string }> } }>(
      urljoin(url, `/api/products/${streamId}/videos/playlist?videoType=${videoType}&platform=BROWSER`),
      videoId,
    );
    const hlsSrc = stream.sources?.HLS?.[0]?.src;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, hlsSrc, videoId, 'hls');

    const thumbUrls = new Set<string>();
    for (const key of ['galary', 'images', 'artworks']) {
      const val = data[key];
      if (!val || typeof val !== 'object') continue;
      for (const item of Object.values(val as Record<string, unknown>)) {
        if (item && typeof item === 'object') {
          for (const sub of Object.values(item as Record<string, unknown>)) {
            if (sub && typeof sub === 'object') {
              const mini = (sub as Record<string, unknown>).miniUrl;
              const main = (sub as Record<string, unknown>).mainUrl;
              if (mini) thumbUrls.add(String(mini));
              if (main) thumbUrls.add(String(main));
            }
          }
        }
      }
    }

    const season = (data.season as Record<string, Record<string, unknown>>) || {};

    return {
      id: videoId,
      title: this._resolveTitle(data),
      description: (data.description ?? data.lead) != null ? String(data.description ?? data.lead) : undefined,
      duration: int_or_none(data.duration) ?? undefined,
      season: season.serial?.title != null ? String(season.serial.title) : undefined,
      season_number: int_or_none(season.number) ?? undefined,
      episode: data.title != null ? String(data.title) : undefined,
      episode_number: int_or_none(data.episode) ?? undefined,
      release_year: int_or_none(season.serial?.year) ?? undefined,
      thumbnails: [...thumbUrls].map((u) => ({ url: u, ext: 'jpg' })),
      formats,
      subtitles,
    };
  }
}
