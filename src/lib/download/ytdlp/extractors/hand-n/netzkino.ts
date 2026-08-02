/**
 * NetzkinoIE — ported from yt-dlp netzkino.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, traverse_obj, url_or_none } from '../../utils';
import { searchNextjsData, urljoin } from './_helpers';

function mapNodes(items: unknown, mapper: (node: Record<string, unknown>) => string | null | undefined): string[] {
  const out: string[] = [];
  for (const item of (items as Array<Record<string, unknown>>) || []) {
    const val = mapper(item);
    if (val) out.push(val);
  }
  return out;
}

export class NetzkinoIE extends InfoExtractor {
  static IE_NAME = 'netzkino';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?netzkino\.de\/details\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const nextJsData = searchNextjsData(this, webpage, videoId);

    const queries = traverse_obj(nextJsData, ['__dehydratedState', 'queries']) as
      | Array<Record<string, unknown>>
      | undefined;
    let query: Record<string, unknown> | undefined;
    for (const q of queries || []) {
      const data = traverse_obj(q, ['state', 'data', 'data']) as Record<string, unknown> | undefined;
      if (data?.__typename === 'CmsMovie') {
        query = data;
        break;
      }
    }
    if (!query) throw new ExtractorError('Movie not found');

    const licenseNodes = ((query.licenses as Record<string, unknown>)?.nodes as Array<Record<string, unknown>>) || [];
    if (licenseNodes.some((n) => String((n.properties as string[]) || []).includes('DRM'))) {
      this.report_warning(`DRM protected: ${videoId}`);
    }

    const pmdUrl = traverse_obj(query, ['videoSource', 'pmdUrl']) as string | undefined;
    const castNodes = ((query.cast as Record<string, unknown>)?.nodes as Array<Record<string, unknown>>) || [];
    const categoryNodes = ((query.categories as Record<string, unknown>)?.nodes as Array<Record<string, unknown>>) || [];

    return {
      id: videoId,
      title: clean_html(String(query.originalTitle ?? '')) || undefined,
      age_limit: int_or_none(query.fskRating) ?? undefined,
      alt_title: clean_html(String(query.originalTitle ?? '')) || undefined,
      cast: mapNodes(castNodes, (n) => clean_html(String(((n.person as Record<string, unknown>) || {}).name ?? '')) || null),
      categories: mapNodes(categoryNodes, (n) =>
        clean_html(String((((n.category as Record<string, unknown>) || {}).title as string) ?? '')) || null,
      ),
      description: clean_html(String(query.longSynopsis ?? '')) || undefined,
      duration: int_or_none(query.runtimeInSeconds) ?? undefined,
      location: clean_html(String(query.productionCountry ?? '')) || undefined,
      release_year: int_or_none(query.productionYear) ?? undefined,
      thumbnail: url_or_none((query.coverImage as Record<string, unknown>)?.masterUrl) ?? undefined,
      url: pmdUrl ? urljoin('https://pmd.netzkino-seite.netzkino.de/', pmdUrl) : undefined,
    };
  }
}
