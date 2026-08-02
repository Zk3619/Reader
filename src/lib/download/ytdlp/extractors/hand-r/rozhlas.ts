/** Rozhlas* — ported from yt-dlp rozhlas.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { extract_attributes, int_or_none, remove_start, str_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class RozhlasIE extends InfoExtractor {
  static IE_NAME = 'Rozhlas';
  static _VALID_URL = /https?:\/\/(?:www\.)?prehravac\.rozhlas\.cz\/audio\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const webpage = await this._download_webpage(`http://prehravac.rozhlas.cz/audio/${audioId}`, audioId);
    const title =
      this._html_search_regex(
        /<h3>([\s\S]+?)<\/h3>\s*<p[^>]*>[\s\S]*?<\/p>\s*<div[^>]+id=["']player-track/,
        webpage,
        'title',
        null,
        false,
      ) || remove_start(this._og_search_title(webpage) || '', 'Radio Wave - ') || undefined;
    const description =
      this._html_search_regex(/<p[^>]+title="([^"]+)"[^>]*>[\s\S]*?<\/p>\s*<div[^>]+id=["']player-track/, webpage, 'description', null, false) ||
      undefined;
    const duration = int_or_none(this._search_regex(/data-duration=["'](\d+)/, webpage, 'duration', null, false));
    return {
      id: audioId,
      url: `http://media.rozhlas.cz/_audio/${audioId}.mp3`,
      title,
      description: description ?? undefined,
      duration: duration ?? undefined,
      vcodec: 'none',
    };
  }
}

export class RozhlasBaseIE extends InfoExtractor {
  static IE_NAME = 'RozhlasBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RozhlasBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractFormats(entry: Record<string, unknown>, audioId: string): Promise<Format[]> {
    const formats: Format[] = [];
    for (const audio of traverse_obj(entry, ['audioLinks', 'all']) as Array<Record<string, unknown>>) {
      const audioUrl = url_or_none(audio.url as string);
      if (!audioUrl) continue;
      const ext = String(audio.variant || 'mp3');
      if (ext === 'dash') {
        formats.push(...(await this._extract_mpd_formats(audioUrl, audioId, 'dash', undefined, false)));
      } else if (ext === 'hls') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, audioUrl, audioId, ext)).formats);
      } else {
        formats.push({
          url: audioUrl,
          ext,
          format_id: ext,
          abr: int_or_none(audio.bitrate as number) ?? undefined,
          acodec: ext,
          vcodec: 'none',
        });
      }
    }
    return formats;
  }
}

export class RozhlasVltavaIE extends RozhlasBaseIE {
  static IE_NAME = 'RozhlasVltava';
  static _VALID_URL = /https?:\/\/(?:\w+\.rozhlas|english\.radio)\.cz\/[\w-]+-(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);
    const entries: VideoInfo[] = [];
    for (const el of [...webpage.matchAll(/<audio-player[^>]+>/g)].map((m) => m[0]!)) {
      const attrs = extract_attributes(el);
      const audioId = attrs['data-audio-id'];
      if (!audioId) continue;
      const apiData = await this._download_json<{ data?: Record<string, unknown> }>(
        `https://www.rozhlas.cz/api/v1/audios/${audioId}`,
        audioId,
      );
      const entry = apiData.data || {};
      entries.push({
        id: audioId,
        title: entry.title as string | undefined,
        description: entry.description as string | undefined,
        duration: int_or_none(entry.duration as number) ?? undefined,
        artist: str_or_none(entry.author as string) ?? undefined,
        channel_id: entry.section as string | undefined,
        formats: await this._extractFormats(entry, audioId),
      });
    }
    if (entries.length === 1) return entries[0]!;
    return this.playlist_result(entries, pageId, this._og_search_title(webpage) ?? undefined);
  }
}

export class MujRozhlasIE extends RozhlasBaseIE {
  static IE_NAME = 'MujRozhlas';
  static _VALID_URL = /https?:\/\/(?:www\.)?muj\.rozhlas\.cz\/[\w-]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const apiData = await this._download_json<{ data?: Record<string, unknown> }>(
      `https://www.rozhlas.cz/api/v1/audios/${audioId}`,
      audioId,
    );
    const entry = apiData.data || {};
    return {
      id: audioId,
      title: entry.title as string | undefined,
      description: entry.description as string | undefined,
      duration: int_or_none(entry.duration as number) ?? undefined,
      timestamp: unified_timestamp(entry.published as string) ?? undefined,
      formats: await this._extractFormats(entry, audioId),
    };
  }
}
