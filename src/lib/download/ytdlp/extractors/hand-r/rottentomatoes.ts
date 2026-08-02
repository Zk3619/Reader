/** RottenTomatoesIE — ported from yt-dlp rottentomatoes.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, float_or_none, join_nonempty, url_or_none } from '../../utils';

function getElementByClass(cls: string, html: string): string | null {
  const m = html.match(new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return m ? m[1]! : null;
}

export class RottenTomatoesIE extends InfoExtractor {
  static IE_NAME = 'RottenTomatoes';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rottentomatoes\.com\/m\/(?<playlist>[^/]+)(?:\/(?<tr>trailers)(?:\/(?<id>\w+))?)?/;

  protected async *_extractVideos(data: unknown, displayId: string): AsyncGenerator<VideoInfo> {
    const items = Array.isArray(data) ? data : [];
    for (const video of items) {
      const v = video as Record<string, unknown>;
      if (!v.publicId || !v.file || v.type !== 'hls') continue;
      const formats = await this._extract_m3u8_formats(String(v.file), displayId, 'mp4', 'm3u8_native', 'hls', undefined, undefined, undefined, false);
      yield {
        id: String(v.publicId),
        title: v.title as string | undefined,
        description: v.description as string | undefined,
        duration: float_or_none(v.durationInSeconds) ?? undefined,
        thumbnail: url_or_none((v.image as string) || undefined) ?? undefined,
        formats,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = join_nonempty(m.groups!.playlist, m.groups!.tr);
    const videoId = m.groups!.id;
    const webpage = await this._download_webpage(url, playlistId!);
    const dataRaw = this._search_regex(/<script[^>]+\bid=["'](?:heroV|v)ideos["'][^>]*>([\s\S]+?)<\/script>/, webpage, 'data', null, false);
    const data = dataRaw ? (this._parse_json(dataRaw, playlistId!) as unknown) : [];

    if (videoId) {
      const items = Array.isArray(data) ? data : [];
      const videoData = items.filter((v) => (v as Record<string, unknown>).publicId === videoId);
      if (!videoData.length) throw new ExtractorError('Unable to extract video from webpage');
      for await (const entry of this._extractVideos(videoData, videoId)) return entry;
      throw new ExtractorError('Unable to extract video from webpage');
    }

    const entries: VideoInfo[] = [];
    for await (const entry of this._extractVideos(data, playlistId!)) entries.push(entry);
    return this.playlist_result(entries, playlistId!, clean_html(getElementByClass('scoreboard__title', webpage) || '') || undefined);
  }
}
