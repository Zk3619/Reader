/** NineNowIE — ported from yt-dlp ninenow.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, traverse_obj } from '../../utils';
import { parseIso8601 } from './_helpers';

export class NineNowIE extends InfoExtractor {
  static IE_NAME = '9now.com.au';
  static _GEO_BYPASS = false;
  static _VALID_URL =
    /https?:\/\/(?:www\.)?9now\.com\.au\/(?:[^/?#]+\/){2}(?<id>(?<type>clip|episode)-[^/?#]+)/;

  protected static BRIGHTCOVE_URL_TEMPLATE =
    'http://players.brightcove.net/4460760524001/default_default/index.html?videoId={}';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const displayId = m?.groups?.id ?? this._match_id(url);
    const videoType = m?.groups?.type ?? 'clip';
    const webpage = await this._download_webpage(url, displayId);

    const nextData = this._search_regex(
      /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
      webpage,
      'next.js data',
      null,
      true,
      1,
    );
    const parsed = this._parse_json<{ props?: { pageProps?: Record<string, unknown> } }>(nextData, displayId);
    const payloads = Object.values(parsed?.props?.pageProps || {}).filter(
      (v) => v && typeof v === 'object' && videoType in (v as Record<string, unknown>),
    );
    const commonData = (payloads[0] as Record<string, unknown>) || parsed?.props?.pageProps || {};

    if (Boolean(traverse_obj(commonData, [videoType, 'video', 'drm']))) {
      this.report_warning(`DRM protected: ${displayId}`);
    }

    const brightcoveId =
      str_or_none(traverse_obj(commonData, [videoType, 'video', 'brightcoveId'])) ||
      (() => {
        const ref = str_or_none(traverse_obj(commonData, [videoType, 'video', 'referenceId']));
        return ref ? `ref:${ref}` : null;
      })();
    if (!brightcoveId) {
      throw new Error('Unable to extract brightcove ID');
    }

    const typeData = (commonData[videoType] as Record<string, unknown>) || {};
    const video = (typeData.video as Record<string, unknown>) || {};
    const imageSizes = (typeData.image as Record<string, unknown>)?.sizes as Record<string, string> | undefined;

    return {
      _type: 'url_transparent',
      ie_key: 'BrightcoveNew',
      url: NineNowIE.BRIGHTCOVE_URL_TEMPLATE.replace('{}', brightcoveId),
      id: str_or_none(video.id) || brightcoveId,
      title: str_or_none(typeData.name) ?? undefined,
      description: str_or_none(typeData.description) ?? undefined,
      duration: float_or_none(video.duration, 1000) ?? undefined,
      tags: ((traverse_obj(typeData, ['tags']) as Array<{ name?: string }>) || [])
        .map((t) => str_or_none(t.name))
        .filter(Boolean) as string[],
      series: str_or_none(traverse_obj(commonData, ['tvSeries', 'name'])) ?? undefined,
      season_number: int_or_none(traverse_obj(commonData, ['season', 'seasonNumber'])) ?? undefined,
      episode_number: int_or_none(traverse_obj(commonData, ['episode', 'episodeNumber'])) ?? undefined,
      timestamp: parseIso8601(traverse_obj(commonData, ['episode', 'airDate'])) ?? undefined,
      release_timestamp: parseIso8601(traverse_obj(typeData, ['availability'])) ?? undefined,
      thumbnails: imageSizes
        ? Object.entries(imageSizes)
            .filter(([, u]) => u)
            .map(([id, u]) => ({ id, url: u }))
        : undefined,
    };
  }
}
