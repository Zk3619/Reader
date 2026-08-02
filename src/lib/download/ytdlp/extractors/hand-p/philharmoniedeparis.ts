/** PhilharmonieDeParisIE — ported from yt-dlp philharmoniedeparis.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { str_or_none } from '../../utils';

export class PhilharmonieDeParisIE extends InfoExtractor {
  static IE_NAME = 'philharmoniedeparis';
  static _VALID_URL =
    /https?:\/\/(?:live\.philharmoniedeparis\.fr\/(?:[Cc]oncert\/|embed(?:app)?\/|misc\/Playlist\.ashx\?id=)|pad\.philharmoniedeparis\.fr\/(?:doc\/CIMU\/|player\.aspx\?id=)|philharmoniedeparis\.fr\/fr\/live\/concert\/|otoplayer\.philharmoniedeparis\.fr\/fr\/embed\/)(?<id>\d+)/;

  protected async _extractEntry(source: Record<string, unknown>, videoId: string): Promise<VideoInfo | null> {
    const title = str_or_none(source.title);
    if (!title) return null;
    const files = source.files as Record<string, unknown> | undefined;
    if (!files || typeof files !== 'object') return null;
    const formatUrls = new Set<string>();
    const formats: Format[] = [];
    for (const formatId of ['mobile', 'desktop'] as const) {
      const fileObj = files[formatId] as Record<string, unknown> | undefined;
      const formatUrl = str_or_none(fileObj?.file);
      if (!formatUrl || formatUrls.has(formatUrl)) continue;
      formatUrls.add(formatUrl);
      formats.push(
        ...(await this._extract_m3u8_formats(formatUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
      );
    }
    if (!formats.length && !this.params.ignore_no_formats_error) return null;
    return {
      id: videoId,
      title,
      formats,
      thumbnail: str_or_none(files.thumbnail) ?? undefined,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const config = await this._download_json<Record<string, unknown>>(
      `https://otoplayer.philharmoniedeparis.fr/fr/config/${videoId}.json`,
      videoId,
      undefined,
      { query: { id: videoId, lang: 'fr-FR' } },
    );

    const info = await this._extractEntry(config, videoId);
    if (info) return { ...info, id: videoId };

    const entries: VideoInfo[] = [];
    for (const [num, chapter] of ((config.chapters as Record<string, unknown>[]) || []).entries()) {
      const entry = await this._extractEntry(chapter, videoId);
      if (!entry) continue;
      entries.push({ ...entry, id: `${videoId}-${num + 1}` });
    }
    return this.playlist_result(entries, videoId, str_or_none(config.title) ?? undefined);
  }
}
