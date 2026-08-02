/**
 * BeatportIE — aligned with yt-dlp beatport.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

interface BeatportTrack {
  id: number;
  slug?: string;
  name: string;
  mix?: string;
  artists: { name: string }[];
  preview: Record<string, { url?: string }>;
  images: Record<string, { url?: string; height?: number; width?: number }>;
}

export class BeatportIE extends InfoExtractor {
  static IE_NAME = 'beatport';
  static _VALID_URL = /https?:\/\/(?:www\.|pro\.)?beatport\.com\/track\/(?<display_id>[^/]+)\/(?<id>[0-9]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const trackId = m.groups?.id ?? m[2] ?? '';
    const displayId = m.groups?.display_id ?? m[1] ?? '';

    const webpage = await this._download_webpage(url, displayId);

    const playables = this._parse_json<{ tracks: BeatportTrack[] }>(
      this._search_regex(/window\.Playables\s*=\s*(\{.+?\});/s, webpage, 'playables info'),
      trackId,
    )!;

    const track = playables.tracks.find((t) => String(t.id) === trackId);
    if (!track) throw new ExtractorError('Track not found in playables data');

    let title = `${track.artists.map((a) => a.name).join(', ')} - ${track.name}`;
    if (track.mix) title += ` (${track.mix})`;

    const formats: Format[] = [];
    for (const [ext, info] of Object.entries(track.preview || {})) {
      if (!info.url) continue;
      const fmt: Format = {
        url: info.url,
        ext,
        format_id: ext,
        vcodec: 'none',
      };
      if (ext === 'mp3') {
        fmt.acodec = 'mp3';
        fmt.abr = 96;
        fmt.asr = 44100;
      } else if (ext === 'mp4') {
        fmt.acodec = 'aac';
        fmt.abr = 96;
        fmt.asr = 44100;
      }
      formats.push(fmt);
    }

    const images: Thumbnail[] = [];
    for (const [name, info] of Object.entries(track.images || {})) {
      if (name === 'dynamic' || !info.url) continue;
      images.push({
        id: name,
        url: info.url,
        height: int_or_none(info.height),
        width: int_or_none(info.width),
      });
    }

    return {
      id: String(track.id ?? trackId),
      display_id: track.slug || displayId,
      title,
      formats,
      thumbnails: images,
      webpage_url: url,
      original_url: url,
      extractor: 'beatport',
      extractor_key: 'Beatport',
    };
  }
}
