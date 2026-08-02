/**
 * TVAIE — ported from yt-dlp tva.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, smuggle_url, traverse_obj } from '../../utils';
import { searchNextjsData, strip_or_none } from './_helpers';

const BC_URL_TMPL = 'https://players.brightcove.net/5481942443001/default_default/index.html?videoId={}';

export class TVAIE extends InfoExtractor {
  static IE_NAME = 'tvaplus';
  static IE_DESC = 'TVA+';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tvaplus\.ca\/(?:[^/?#]+\/)*[\w-]+-(?<id>\d+)(?:$|[#?])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const entityId = this._match_id(url);
    const webpage = await this._download_webpage(url, entityId);
    const props = searchNextjsData(this, webpage, entityId);
    const entity = traverse_obj(props, ['pageProps', 'staticEntity']) as Record<string, unknown>;
    const videoId = String(entity.videoId || entityId);
    const episode = strip_or_none(entity.name);

    const seasonSlug = entity.slug != null ? String(entity.slug) : '';
    const seasonMatch = seasonSlug.match(/\/s(?:ai|ea)son-(\d+)\//i);

    return {
      _type: 'url_transparent',
      url: smuggle_url(BC_URL_TMPL.replace('{}', videoId), { geo_countries: ['CA'] }),
      ie_key: 'BrightcoveNew',
      id: videoId,
      title: episode || undefined,
      episode: episode || undefined,
      description: strip_or_none(entity.longDescription) || undefined,
      duration: float_or_none(entity.durationMillis, 0.001) ?? undefined,
      channel: traverse_obj(entity, ['knownEntities', 'channel', 'name']) != null
        ? String(traverse_obj(entity, ['knownEntities', 'channel', 'name']))
        : undefined,
      series: traverse_obj(entity, ['knownEntities', 'videoShow', 'name']) != null
        ? String(traverse_obj(entity, ['knownEntities', 'videoShow', 'name']))
        : undefined,
      season_number: seasonMatch ? int_or_none(seasonMatch[1]) ?? undefined : undefined,
      episode_number: int_or_none(entity.episodeNumber) ?? undefined,
    };
  }
}
