/**
 * AENetworksIE / BiographyIE / HistoryPlayerIE / HistoryTopicIE — aligned with yt-dlp aenetworks.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  traverse_obj,
  update_url_query,
  url_or_none,
} from '../../utils';
import { extractSmilMediaUrls, signTheplatformUrl } from './_helpers';

type DomainMapEntry = [string | null, string, string | null];

const BASE_URL_REGEX =
  /https?:\/\/(?:(?:www|play|watch)\.)?(?<domain>(?:history(?:vault)?|aetv|mylifetime|lifetimemovieclub)\.com|fyi\.tv)\//i;

const DOMAIN_MAP: Record<string, DomainMapEntry> = {
  'history.com': ['HISTORY', 'history', null],
  'aetv.com': ['AETV', 'aetv', null],
  'mylifetime.com': ['LIFETIME', 'lifetime', null],
  'fyi.tv': ['FYI', 'fyi', null],
  'lifetimemovieclub.com': ['LIFETIMEMOVIECLUB', 'lmc', null],
  'historyvault.com': [null, 'historyvault', null],
  'biography.com': [null, 'biography', null],
};

const GRAPHQL_QUERY = `
        query getUserVideo($videoId: ID!) {
            video(id: $videoId) {
                title
                publicUrl
                programId
                tvSeasonNumber
                tvSeasonEpisodeNumber
                series {
                    title
                }
            }
        }`;

const TP_SMIL_QUERY = [
  { assetTypes: 'high_video_ak', switch: 'hls_high_ak' },
  { assetTypes: 'high_video_s3' },
  { assetTypes: 'high_video_s3', switch: 'hls_high_fastly' },
];

abstract class AENetworksBaseIE extends InfoExtractor {
  static _THEPLATFORM_KEY = '43jXaGRQud';
  static _THEPLATFORM_SECRET = 'S10BPXHMlb';

  protected async _extractAenSmil(
    smilUrl: string,
    videoId: string,
    auth?: string | null,
  ): Promise<{ id: string; formats: Format[] }> {
    const query: Record<string, string> = {
      mbr: 'true',
      formats: 'M3U+none,MPEG-DASH+none,MPEG4,MP3',
    };
    if (auth) query.auth = auth;

    const formats: Format[] = [];
    let lastError: Error | null = null;

    for (const q of TP_SMIL_QUERY) {
      const merged = { ...query, ...q };
      let mUrl = update_url_query(smilUrl, merged);
      mUrl = await signTheplatformUrl(
        mUrl,
        (this.constructor as typeof AENetworksBaseIE)._THEPLATFORM_KEY,
        (this.constructor as typeof AENetworksBaseIE)._THEPLATFORM_SECRET,
      );
      const note = q.switch || q.assetTypes;
      try {
        const smilXml = await this._download_webpage(mUrl, videoId, `Downloading ${note} SMIL data`);
        for (const mediaUrl of extractSmilMediaUrls(smilXml)) {
          if (/\.m3u8/i.test(mediaUrl)) {
            formats.push(
              ...(await this._extract_m3u8_formats(
                mediaUrl,
                videoId,
                'mp4',
                'm3u8_native',
                undefined,
                undefined,
                String(q.switch || q.assetTypes),
              )),
            );
          } else {
            formats.push(this._create_format(mediaUrl, { format_id: String(q.switch || q.assetTypes) }));
          }
        }
      } catch (e) {
        lastError = e as Error;
        continue;
      }
    }

    if (lastError && !formats.length) throw lastError;
    return { id: videoId, formats };
  }

  protected async _downloadTheplatformMetadata(path: string, videoId: string): Promise<Record<string, unknown>> {
    return (
      (await this._download_json<Record<string, unknown>>(
        `https://link.theplatform.com/s/${path}`,
        videoId,
        'Downloading ThePlatform metadata',
        { query: { format: 'preview' }, fatal: false },
      )) || {}
    );
  }

  protected _parseTheplatformMetadata(tpMetadata: Record<string, unknown>): Partial<VideoInfo> {
    return {
      title: traverse_obj(tpMetadata, ['title', { expected_type: String }]) as string | undefined,
      description: traverse_obj(tpMetadata, ['description', { expected_type: String }]) as string | undefined,
      thumbnail: url_or_none(tpMetadata.defaultThumbnailUrl) || undefined,
      duration: float_or_none(tpMetadata.pubDate, 1000) ?? undefined,
      timestamp: float_or_none(tpMetadata.pubDate, 1000) ?? undefined,
      uploader: traverse_obj(tpMetadata, ['billingCode', { expected_type: String }]) as string | undefined,
    };
  }

  protected async _extractAetnInfo(
    domain: string,
    filterKey: 'canonical' | 'id',
    filterValue: string,
    url: string,
  ): Promise<VideoInfo> {
    const [, brand] = DOMAIN_MAP[domain] || [null, domain.split('.')[0], null];
    let graphqlVideoId: string;

    if (filterKey === 'canonical') {
      const webpage = await this._download_webpage(url, filterValue);
      graphqlVideoId =
        this._search_regex(
          /<meta\b[^>]+\bcontent="[^"]*\btpid\/(\d+)"/,
          webpage,
          'id',
          null,
          false,
        ) ||
        this._html_search_meta('videoId', webpage, 'GraphQL video ID', true) ||
        '';
    } else {
      graphqlVideoId = filterValue;
    }

    const result = await this._download_json<Record<string, unknown>>(
      'https://yoga.appsvcs.aetnd.com/',
      graphqlVideoId,
      'Downloading A+E GraphQL',
      {
        query: { brand, mode: 'live', platform: 'web' },
        data: JSON.stringify({
          operationName: 'getUserVideo',
          variables: { videoId: graphqlVideoId },
          query: GRAPHQL_QUERY,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );

    const video = traverse_obj(result, ['data', 'video']) as Record<string, unknown> | undefined;
    const mediaUrl = url_or_none(video?.publicUrl);
    if (!mediaUrl) {
      throw new ExtractorError('Show not found in A&E feed (too new?)', { expected: true });
    }

    const title = String(video?.title || graphqlVideoId);
    const videoId = String(video?.programId || graphqlVideoId);
    const tpPath = this._search_regex(
      /https?:\/\/link\.theplatform\.com\/s\/([^?]+)/,
      mediaUrl,
      'theplatform_path',
    );
    const tpMetadata = await this._downloadTheplatformMetadata(tpPath || '', videoId);
    const info: VideoInfo = {
      title,
      ...this._parseTheplatformMetadata(tpMetadata),
      ...(await this._extractAenSmil(mediaUrl, videoId)),
      id: videoId,
      display_id: graphqlVideoId,
      series: traverse_obj(video, ['series', 'title', { expected_type: String }]) as string | undefined,
      season_number: int_or_none(video?.tvSeasonNumber) ?? undefined,
      episode_number: int_or_none(video?.tvSeasonEpisodeNumber) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: (this.constructor as typeof InfoExtractor).IE_NAME,
      extractor_key: undefined,
    };
    return info;
  }
}

export class AENetworksIE extends AENetworksBaseIE {
  static IE_NAME = 'aenetworks';
  static IE_DESC = 'A+E Networks: A&E, Lifetime, History.com, FYI Network and History Vault';
  static _VALID_URL = new RegExp(
    String.raw`${BASE_URL_REGEX.source}(?<id>shows/[^/?#]+/season-\d+/episode-\d+|(?<type>movie|special)s/[^/?#]+(?<extra>/[^/?#]+)?|(?:shows/[^/?#]+/)?videos/[^/?#]+)`,
    'i',
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    if (!m?.groups) throw new ExtractorError(`Could not parse A+E URL: ${url}`, { expected: true });
    let { domain, id: canonical, type: urlType, extra } = m.groups as Record<string, string | undefined>;
    if (urlType && (urlType === 'movie' || urlType === 'special') && !extra) {
      canonical = `${canonical}/full-${urlType}`;
    }
    return this._extractAetnInfo(domain!, 'canonical', `/${canonical}`, url);
  }
}

export class HistoryTopicIE extends AENetworksBaseIE {
  static IE_NAME = 'history:topic';
  static IE_DESC = 'History.com Topic';
  static _VALID_URL = /https?:\/\/(?:www\.)?history\.com\/topics\/[^/]+\/(?<id>[\w+-]+?)-video/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    return this.url_result(`http://www.history.com/videos/${displayId}`, 'AENetworks');
  }
}

export class HistoryPlayerIE extends AENetworksBaseIE {
  static IE_NAME = 'history:player';
  static _VALID_URL = /https?:\/\/(?:www\.)?(?<domain>(?:history|biography)\.com)\/player\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    return this._extractAetnInfo(m!.groups!.domain as string, 'id', m!.groups!.id as string, url);
  }
}

export class BiographyIE extends AENetworksBaseIE {
  static IE_NAME = 'biography';
  static _VALID_URL = /https?:\/\/(?:www\.)?biography\.com\/video\/(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const playerUrl = this._search_regex(
      /<phoenix-iframe[^>]+src="(https?:\/\/(?:www\.)?(?:history|biography)\.com\/player\/\d+)"/i,
      webpage,
      'player URL',
    );
    return this.url_result(playerUrl!, 'HistoryPlayer');
  }
}
