/**
 * JeuxVideoIE — ported from yt-dlp jeuxvideo.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';

export class JeuxVideoIE extends InfoExtractor {
  static IE_NAME = 'jeuxvideo';
  static _VALID_URL = /https?:\/\/.*?\.jeuxvideo\.com\/.*\/(.*?)\.htm/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let slug = m[1] ?? m[0] ?? url;
    const webpage = await this._download_webpage(url, slug);

    const title =
      this._html_search_meta('name', webpage) || this._og_search_title(webpage) || slug;

    const configPath = this._html_search_regex(
      /data-src(?:set-video)?="(\/contenu\/medias\/video\.php.*?)"/,
      webpage,
      'config URL',
    )!;
    const configUrl = `http://www.jeuxvideo.com${configPath}`;

    const videoId = this._search_regex(/id=(\d+)/, configUrl, 'video ID')!;
    const config = await this._download_json<{ sources?: Array<Record<string, unknown>>; image?: string }>(
      configUrl,
      title,
      'Downloading JSON config',
    );

    const sources = [...(config.sources || [])].reverse();
    const formats: Format[] = sources.map((source) => ({
      url: String(source.file ?? ''),
      format_id: String(source.label ?? '0'),
      ext: 'mp4',
      resolution: source.label != null ? String(source.label) : undefined,
    }));

    return {
      id: videoId,
      title,
      formats,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: config.image ?? undefined,
    };
  }
}
