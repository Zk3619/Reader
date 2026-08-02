/**
 * KelbyOneIE — ported from yt-dlp kelbyone.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class KelbyOneIE extends InfoExtractor {
  static IE_NAME = 'kelbyone';
  static _VALID_URL = /https?:\/\/members\.kelbyone\.com\/course\/(?<id>[^$&?#/]+)/;

  protected async *_entries(playlist: Array<Record<string, unknown>>): AsyncGenerator<VideoInfo> {
    for (const item of playlist) {
      const videoId = String(item.mediaid ?? '');
      const thumbnails: Thumbnail[] = ((item.images as Array<Record<string, unknown>>) || [])
        .map((image) => ({
          url: String(image.src ?? ''),
          width: int_or_none(image.width) ?? undefined,
        }))
        .filter((t) => t.url);

      const formats: Format[] = [];
      let subtitles: Record<string, Subtitle[]> = {};

      for (const source of (item.sources as Array<Record<string, unknown>>) || []) {
        if (!source.file) continue;
        if (source.type === 'application/vnd.apple.mpegurl') {
          const res = await extractM3u8FormatsAndSubtitles(this, String(source.file), videoId);
          formats.push(...res.formats);
          subtitles = mergeSubtitles(subtitles, res.subtitles);
        } else if (source.type === 'audio/mp4') {
          formats.push({
            format_id: String(source.label ?? 'audio'),
            url: String(source.file),
            vcodec: 'none',
          });
        } else {
          formats.push({
            format_id: String(source.label ?? `http-${formats.length}`),
            height: int_or_none(source.height) ?? undefined,
            width: int_or_none(source.width) ?? undefined,
            url: String(source.file),
          });
        }
      }

      for (const track of (item.tracks as Array<Record<string, unknown>>) || []) {
        if (track.kind === 'captions' && track.file) {
          (subtitles.en ||= []).push({ url: String(track.file), ext: 'vtt' });
        }
      }

      yield {
        id: videoId,
        title: String(item.title ?? videoId),
        description: (item.description as string | undefined) ?? undefined,
        thumbnails,
        thumbnail: (item.image as string | undefined) ?? undefined,
        timestamp: int_or_none(item.pubdate) ?? undefined,
        duration: int_or_none(item.duration) ?? undefined,
        formats,
        subtitles,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const itemId = this._match_id(url);
    const webpage = await this._download_webpage(url, itemId);
    const playlistUrl = this._html_search_regex(
      /playlist"\:"(https.*content\.jwplatform\.com.*json)"/,
      webpage,
      'playlist url',
    )!.replace(/\\/g, '');

    const courseData = await this._download_json<{ playlist?: Array<Record<string, unknown>>; title?: string; description?: string }>(
      playlistUrl,
      itemId,
    );

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(courseData.playlist || [])) {
      entries.push(entry);
    }

    return this.playlist_result(
      entries,
      itemId,
      courseData.title,
      courseData.description,
    );
  }
}
