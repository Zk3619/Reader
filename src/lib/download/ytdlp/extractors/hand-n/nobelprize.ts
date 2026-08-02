/** NobelPrizeIE — ported from yt-dlp nobelprize.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, parse_duration } from '../../utils';

function parseQuery(url: string): Record<string, string[]> {
  try {
    const u = new URL(url);
    const out: Record<string, string[]> = {};
    u.searchParams.forEach((v, k) => {
      (out[k] ||= []).push(v);
    });
    return out;
  } catch {
    return {};
  }
}

export class NobelPrizeIE extends InfoExtractor {
  static IE_NAME = 'NobelPrize';
  static _VALID_URL = /https?:\/\/(?:(?:mediaplayer|www)\.)?nobelprize\.org\/mediaplayer\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parseQuery(url);
    const videoId = int_or_none(qs.id?.[0] ?? qs.qid?.[0]);
    if (!videoId) throw new ExtractorError(`Unsupported URL: ${url}`, { expected: true });

    const pageUrl = url.replace(/\/\/(?:www\.)?nobelprize\.org/, '//mediaplayer.nobelprize.org');
    const webpage = await this._download_webpage(pageUrl, String(videoId));
    const ld = this._search_json_ld(webpage, String(videoId), { fatal: false });

    const descMatch = webpage.match(/itemprop=["']description["'][^>]*>([\s\S]*?)<\//i);
    return {
      ...(ld || {}),
      id: String(videoId),
      title: this._html_search_meta('caption', webpage) || (ld?.title as string | undefined),
      description: descMatch ? clean_html(descMatch[1]!) : (ld?.description as string | undefined),
      duration: parse_duration(this._html_search_meta('duration', webpage) || undefined) ?? undefined,
    };
  }
}
