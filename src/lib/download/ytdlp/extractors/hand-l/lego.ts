/**
 * LEGOIE — ported from yt-dlp lego.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, join_nonempty } from '../../utils';

const QUALITIES: Record<string, [number, number, number]> = {
  Lowest: [64, 180, 320],
  Low: [64, 270, 480],
  Medium: [96, 360, 640],
  High: [128, 540, 960],
  Highest: [128, 720, 1280],
};

const QUALITY_ORDER = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];

export class LEGOIE extends InfoExtractor {
  static IE_NAME = 'lego';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?lego\.com\/(?<locale>[a-z]{2}-[a-z]{2})\/(?:[^/]+\/)*videos\/(?:[^/]+\/)*[^/?#]+-(?<id>[0-9a-f]{32})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const locale = m.groups?.locale || 'en-us';
    const videoId = m.groups?.id || this._match_id(url);
    const countries = [locale.split('-')[1]?.toUpperCase() || 'US'];

    let item: Record<string, unknown>;
    try {
      item = await this._download_json<Record<string, unknown>>(
        'https://services.slingshot.lego.com/mediaplayer/v2',
        videoId,
        undefined,
        {
          query: { videoId: `${videoId.slice(0, 8)}-${videoId.slice(8, 12)}-${videoId.slice(12, 16)}-${videoId.slice(16, 20)}-${videoId.slice(20)}_${locale}` },
          headers: this.geo_verification_headers(),
        },
      );
    } catch (e) {
      if (e instanceof ExtractorError && (e as ExtractorError & { cause?: { status?: number } }).cause?.status === 451) {
        this.raise_geo_restricted(`Only available in ${countries.join(', ')}`);
      }
      throw e;
    }

    const video = (item.Video as Record<string, unknown>) || {};
    const resolvedId = String(video.Id ?? videoId);
    const title = String(video.Title ?? resolvedId);

    const qRank = (name: string) => {
      const idx = QUALITY_ORDER.indexOf(name);
      return idx >= 0 ? idx : -1;
    };

    const formats: Format[] = [];
    for (const videoSource of (item.VideoFormats as Array<Record<string, unknown>>) || []) {
      const videoSourceUrl = videoSource.Url;
      if (!videoSourceUrl) continue;
      const videoSourceFormat = String(videoSource.Format || '');
      if (videoSourceFormat === 'F4M') {
        formats.push(...(await this._extract_mpd_formats(String(videoSourceUrl), resolvedId, videoSourceFormat, undefined, false)));
      } else if (videoSourceFormat === 'M3U8') {
        formats.push(
          ...(await this._extract_m3u8_formats(String(videoSourceUrl), resolvedId, 'mp4', 'm3u8_native', undefined, undefined, videoSourceFormat, undefined, false)),
        );
      } else {
        const videoSourceQuality = String(videoSource.Quality || '');
        const f: Format = {
          format_id: join_nonempty(videoSourceFormat, videoSourceQuality),
          quality: qRank(videoSourceQuality),
          url: String(videoSourceUrl),
        };
        const quality = QUALITIES[videoSourceQuality];
        if (quality) {
          f.abr = quality[0];
          f.height = quality[1];
          f.width = quality[2];
        }
        formats.push(f);
      }
    }

    const subtitles: Record<string, Subtitle[]> = {};
    const subFileId = video.SubFileId;
    if (subFileId && subFileId !== '00000000-0000-0000-0000-000000000000') {
      const netStoragePath = video.NetstoragePath;
      const invariantId = video.InvariantId;
      const videoFileId = video.VideoFileId;
      const videoVersion = video.VideoVersion;
      if (netStoragePath && invariantId && videoFileId && videoVersion) {
        const lang = locale.slice(0, 2);
        subtitles[lang] = [
          {
            url: `https://lc-mediaplayerns-live-s.legocdn.com/public/${netStoragePath}/${invariantId}_${videoFileId}_${locale}_${videoVersion}_sub.srt`,
            ext: 'srt',
          },
        ];
      }
    }

    return {
      id: resolvedId,
      title,
      description: video.Description != null ? String(video.Description) : undefined,
      thumbnail: video.GeneratedCoverImage || video.GeneratedThumbnail
        ? String(video.GeneratedCoverImage || video.GeneratedThumbnail)
        : undefined,
      duration: int_or_none(video.Length) ?? undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      age_limit: int_or_none(video.AgeFrom) ?? undefined,
      season: video.SeasonTitle != null ? String(video.SeasonTitle) : undefined,
      season_number: int_or_none(video.Season) ?? undefined,
      episode_number: int_or_none(video.Episode) ?? undefined,
    };
  }
}
