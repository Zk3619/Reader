/**
 * TVIPlayerIE — ported from yt-dlp tviplayer.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, js_to_json } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class TVIPlayerIE extends InfoExtractor {
  static _VALID_URL =
    /https?:\/\/tviplayer\.iol\.pt(?:\/programa\/[\w-]+\/[a-f0-9]+)?\/\w+\/(?<id>\w+)/;

  protected wmsAuthSignToken = '';

  async _real_initialize(): Promise<void> {
    this.wmsAuthSignToken = await this._download_webpage(
      'https://services.iol.pt/matrix?userId=',
      'wmsAuthSign',
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    if (!this.wmsAuthSignToken) await this._real_initialize();
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonData = this._parse_json<Record<string, unknown>>(
      this._search_regex(/\sopts\s*=\s*\{\s*video\s*:\s*\[/, webpage, 'JSON data')!,
      videoId,
      js_to_json,
    );
    if (!jsonData) throw new ExtractorError('TVI Player JSON missing', { expected: true });

    const videoUrl = String(jsonData.videoUrl || '');
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      `${videoUrl}?wmsAuthSign=${this.wmsAuthSignToken}`,
      videoId,
      'mp4',
    );

    const ldItems = this._search_json_ld(webpage, videoId, { fatal: false });
    const ldList = Array.isArray(ldItems) ? ldItems : ldItems ? [ldItems] : [];
    const episodeLd = ldList.find(
      (item) => item && typeof item === 'object' && (item as Record<string, unknown>)['@type'] === 'TVEpisode',
    ) as Record<string, unknown> | undefined;

    return {
      id: videoId,
      title: jsonData.title != null ? String(jsonData.title) : this._og_search_title(webpage) || videoId,
      thumbnail:
        (jsonData.cover != null ? String(jsonData.cover) : undefined) ||
        this._og_search_thumbnail(webpage) ||
        undefined,
      duration: int_or_none(jsonData.duration) ?? undefined,
      formats,
      subtitles,
      season_number: int_or_none(episodeLd?.seasonNumber) ?? undefined,
      episode_number: int_or_none(jsonData.episodeNum) ?? undefined,
    };
  }
}
