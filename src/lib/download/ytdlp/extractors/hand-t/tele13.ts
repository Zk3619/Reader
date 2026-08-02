/** Tele13IE — ported from yt-dlp tele13.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, js_to_json } from '../../utils';
import { extractM3u8FormatsAndSubtitles, qualityRank } from './_helpers';

const LABEL_RANK = qualityRank(['Móvil', 'SD', 'HD']);

export class Tele13IE extends InfoExtractor {
  static IE_NAME = 'tele13';
  static _VALID_URL = /https?:\/\/(?:www\.)?t13\.cl\/videos(?:\/[^/]+)+\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const setupJs = this._search_regex(/jwplayer\('player-vivo'\)\.setup\((\{[\s\S]*?\})\)/, webpage, 'setup code')!;
    const sourcesRaw = this._search_regex(/sources\s*:\s*(\[[^\]]+\])/, setupJs, 'sources');
    const sources = this._parse_json<Array<{ file?: string; label?: string }>>(sourcesRaw, displayId, js_to_json)!;

    const formats: Format[] = [];
    const seen = new Set<string>();
    for (const f of sources) {
      const formatUrl = f.file;
      if (!formatUrl || seen.has(formatUrl)) continue;
      seen.add(formatUrl);
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, formatUrl, displayId, 'hls')).formats);
      } else if (/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(formatUrl)) {
        return this.url_result(formatUrl, 'Youtube');
      } else {
        formats.push({
          url: formatUrl,
          format_id: f.label || ext,
          quality: LABEL_RANK(f.label || ''),
          ext,
        });
      }
    }

    return {
      id: displayId,
      title: this._search_regex(/title\s*:\s*"([^"]+)"/, setupJs, 'title')!,
      description: this._html_search_meta('description', webpage, 'description') ?? undefined,
      thumbnail: this._search_regex(/image\s*:\s*"([^"]+)"/, setupJs, 'thumbnail', null, false) ?? undefined,
      formats,
    };
  }
}
