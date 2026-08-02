/** RadioRadicaleIE — ported from yt-dlp radioradicale.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class RadioRadicaleIE extends InfoExtractor {
  static IE_NAME = 'RadioRadicale';
  static _VALID_URL = /https?:\/\/(?:www\.)?radioradicale\.it\/scheda\/(?<id>[0-9]+)/;

  protected async *_entries(videosInfo: Record<string, unknown>, pageId: string): AsyncGenerator<VideoInfo> {
    const playlist = (videosInfo.playlist as Array<Record<string, unknown>>) || [];
    for (const [idx, video] of playlist.entries()) {
      if (!video.sources) continue;
      const videoId = `${pageId}-${idx}`;
      const formats: Format[] = [];
      const subtitles: Record<string, Subtitle[]> = {};
      for (const m3u8Url of traverse_obj(video, ['sources', 'all', 'src'], { expected_type: 'url' }) as string[]) {
        const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId);
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      }
      for (const sub of (video.subtitles as Array<Record<string, unknown>>) || []) {
        const subUrl = url_or_none(sub.src);
        if (!subUrl) continue;
        mergeSubtitles(subtitles, {
          [String(sub.srclang || 'und')]: [{ url: subUrl, ext: 'vtt', name: sub.label as string | undefined }],
        });
      }
      yield {
        id: videoId,
        title: video.title as string | undefined,
        formats,
        subtitles,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageId = this._match_id(url);
    const webpage = await this._download_webpage(url, pageId);
    const searchResult = this._search_json(
      /jQuery\.extend\(Drupal\.settings\s*,/,
      webpage,
      'videos_info',
      pageId,
    ) as Record<string, unknown> | null;
    const videosInfo = (searchResult?.RRscheda as Record<string, unknown>) || {};

    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(videosInfo, pageId)) entries.push(entry);

    const commonInfo: VideoInfo = {
      id: pageId,
      title: this._og_search_title(webpage) ?? undefined,
      description: this._og_search_description(webpage) ?? undefined,
      location: videosInfo.luogo as string | undefined,
      ...(this._search_json_ld(webpage, pageId, { fatal: false }) || {}),
    };

    if (entries.length === 1) {
      return { ...entries[0], ...commonInfo };
    }
    return this.playlist_result(entries, pageId, commonInfo.title, commonInfo.description);
  }
}
