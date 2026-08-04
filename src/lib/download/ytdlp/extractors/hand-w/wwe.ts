// @ts-nocheck
/** WWEBaseIE / WWEIE / WWEPlaylistIE â€?ported from yt-dlp wwe.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { try_get, unescapeHTML, url_or_none } from '../../utils';
import { urljoin } from './_helpers';

export class WWEBaseIE extends InfoExtractor {
  static IE_NAME = 'wwe:base';
  static _VALID_URL = false as const;

  static _SUBTITLE_LANGS: Record<string, string> = {
    English: 'en',
    Deutsch: 'de',
  };

  protected async _extractEntry(
    data: Record<string, unknown>,
    url: string,
    videoId?: string | null,
  ): Promise<VideoInfo> {
    const id = String(videoId || data.nid);
    const title = String(data.title || id);

    const formats = await this._extract_m3u8_formats(
      String(data.file),
      id,
      'mp4',
      'm3u8_native',
      undefined,
      undefined,
      'hls',
    );

    const description = data.description as string | undefined;
    const image = url_or_none(data.image);
    const thumbnail = image ? urljoin(url, image) : undefined;
    const series = data.show_name as string | undefined;
    const episode = data.episode_name as string | undefined;

    const subtitles: Record<string, Subtitle[]> = {};
    const tracks = data.tracks;
    if (Array.isArray(tracks)) {
      for (const track of tracks) {
        if (!track || typeof track !== 'object') continue;
        const t = track as Record<string, unknown>;
        if (t.kind !== 'captions') continue;
        const trackFile = url_or_none(t.file);
        if (!trackFile) continue;
        const label = t.label as string | undefined;
        const lang = WWEBaseIE._SUBTITLE_LANGS[label || ''] || label || 'en';
        (subtitles[lang] ||= []).push({ url: trackFile });
      }
    }

    return {
      id,
      title,
      description,
      thumbnail: thumbnail || undefined,
      series,
      episode,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('WWEBaseIE is not a standalone extractor', { expected: true });
  }
}

export class WWEIE extends WWEBaseIE {
  static IE_NAME = 'wwe';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?wwe\.com\/(?:[^/]+\/)*videos\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const landing = this._parse_json<Record<string, unknown>>(
      this._html_search_regex(
        /Drupal\.settings\s*,\s*(\{[\s\S]+?\})\s*\)\s*;/,
        webpage,
        'drupal settings',
      )!,
      displayId,
    )!;

    const wweLanding = landing.WWEVideoLanding as Record<string, unknown>;
    const initialVideo = wweLanding.initialVideo as Record<string, unknown>;
    const data = (initialVideo.playlist as Array<Record<string, unknown>>)[0]!;
    const videoId = wweLanding.initialVideoId as string | undefined;

    const info = await this._extractEntry(data, url, videoId);
    info.display_id = displayId;
    return info;
  }
}

export class WWEPlaylistIE extends WWEBaseIE {
  static IE_NAME = 'wwe:playlist';
  static _VALID_URL =
    /https?:\/\/(?:[^/]+\.)?wwe\.com\/(?:[^/]+\/)*(?<id>[^/?#&]+)/;

  static suitable(url: string): boolean {
    if (WWEIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const entries: VideoInfo[] = [];
    for (const mobj of webpage.matchAll(/data-video\s*=\s*(["'])(?<data>\{.+?\})\1/g)) {
      const video = this._parse_json<Record<string, unknown>>(
        mobj.groups!.data!,
        displayId,
        (s) => unescapeHTML(s) || s,
        false,
      );
      if (!video) continue;
      const data = try_get(
        video,
        (x) => (x.playlist as Array<Record<string, unknown>>)[0],
      ) as Record<string, unknown> | null;
      if (!data) continue;
      try {
        const entry = await this._extractEntry(data, url);
        entry.extractor_key = 'WWE';
        entries.push(entry);
      } catch {
        continue;
      }
    }

    return this.playlist_result(entries, displayId);
  }
}
