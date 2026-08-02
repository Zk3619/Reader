/**
 * BerufeTVIE — aligned with yt-dlp berufetv.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, mimetype2ext, str_or_none } from '../../utils';

export class BerufeTVIE extends InfoExtractor {
  static IE_NAME = 'berufetv';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?web\.arbeitsagentur\.de\/berufetv\/[^?#]+\/film;filmId=(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const movieMetadata = await this._download_json<Record<string, unknown>>(
      'https://rest.arbeitsagentur.de/infosysbub/berufetv/pc/v1/film-metadata',
      videoId,
      'Downloading JSON metadata',
      { headers: { 'X-API-Key': '79089773-4892-4386-86e6-e8503669f426' }, fatal: false },
    );

    const metadaten = (movieMetadata?.metadaten as Record<string, unknown>[]) || [];
    const meta = metadaten.find((i) => str_or_none(i?.miId) === videoId) || {};

    const video = await this._download_json<Record<string, unknown>>(
      `https://d.video-cdn.net/play/player/8YRzUk6pTzmBdrsLe9Y88W/video/${videoId}`,
      videoId,
      'Downloading video JSON',
    );

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const videoSourcesHtml = ((video.videoSources as Record<string, unknown>)?.html as Record<string, unknown>) || {};
    for (const [key, source] of Object.entries(videoSourcesHtml)) {
      const src0 = (source as Record<string, unknown>[])?.[0];
      if (!src0) continue;
      if (key === 'auto') {
        const fmts = await this._extract_m3u8_formats(
          String(src0.source),
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
        formats.push(...fmts);
      } else {
        formats.push({
          url: String(src0.source),
          ext: mimetype2ext(src0.mimeType as string) || undefined,
          format_id: key,
        });
      }
    }

    for (const track of (video.videoTracks as Record<string, unknown>[]) || []) {
      if (track.type !== 'SUBTITLES') continue;
      const lang = str_or_none(track.language) || 'und';
      if (!subtitles[lang]) subtitles[lang] = [];
      subtitles[lang]!.push({
        url: String(track.source),
        name: str_or_none(track.label) || undefined,
        ext: 'vtt',
      });
    }

    return {
      id: videoId,
      title:
        str_or_none(meta.titel) ||
        str_or_none((video.videoMetaData as Record<string, unknown>)?.title) ||
        videoId,
      description: str_or_none(meta.beschreibung) || null,
      thumbnail:
        str_or_none(meta.thumbnail) ||
        `https://asset-out-cdn.video-cdn.net/private/videos/${videoId}/thumbnails/active`,
      duration: float_or_none(video.duration, 1000) ?? undefined,
      categories: meta.kategorie ? [String(meta.kategorie)] : null,
      tags: (meta.themengebiete as string[]) || null,
      subtitles,
      formats,
      webpage_url: url,
      original_url: url,
      extractor: 'berufetv',
      extractor_key: 'BerufeTV',
    };
  }
}
