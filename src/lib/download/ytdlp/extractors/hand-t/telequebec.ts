/** TeleQuebec family ù?ported from yt-dlp telequebec.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, smuggle_url, try_get, unified_timestamp } from '../../utils';

export class TeleQuebecBaseIE extends InfoExtractor {
  static IE_NAME = 'telequebecbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TeleQuebecBaseIE is not a standalone extractor', { expected: true });
  }

  protected _brightcoveResult(brightcoveId: string, playerId: string, accountId = '6150020952001'): VideoInfo {
    const raw = `http://players.brightcove.net/${accountId}/${playerId}_default/index.html?videoId=${brightcoveId}`;
    const url = smuggle_url(raw, { geo_countries: ['CA'] });
    return { _type: 'url_transparent', url, ie_key: 'BrightcoveNew', id: brightcoveId };
  }
}

export class TeleQuebecIE extends TeleQuebecBaseIE {
  static IE_NAME = 'telequebec';
  static _VALID_URL =
    /https?:\/\/(?:zonevideo\.telequebec\.tv\/media|coucou\.telequebec\.tv\/videos)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const media = (await this._download_json<{ media?: Record<string, unknown> }>(
      `https://mnmedias.api.telequebec.tv/api/v3/media/${mediaId}`,
      mediaId,
    )).media!;
    const streamInfos = (media.streamInfos as Array<{ source?: string; sourceId?: string }>) || [];
    const sourceId = streamInfos.find((s) => s.source === 'Brightcove')?.sourceId!;
    const info = this._brightcoveResult(sourceId, '22gPKdt7f');
    const product = (media.product as Record<string, unknown>) || {};
    const season = (product.season as Record<string, unknown>) || {};
    Object.assign(info, {
      description: try_get(media, (x) => {
        const descs = x.descriptions as Array<{ text?: string }> | undefined;
        return descs?.length ? descs[descs.length - 1]?.text : undefined;
      }) as string | undefined,
      series: try_get(season, (x) => (x.serie as { titre?: string })?.titre) as string | undefined,
      season: season.name as string | undefined,
      season_number: int_or_none(season.seasonNo) ?? undefined,
      episode: product.titre as string | undefined,
      episode_number: int_or_none(product.episodeNo) ?? undefined,
    });
    return info;
  }
}

export class TeleQuebecSquatIE extends InfoExtractor {
  static IE_NAME = 'telequebec:squat';
  static _VALID_URL = /https?:\/\/squat\.telequebec\.tv\/videos\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const video = await this._download_json<Record<string, unknown>>(`https://squat.api.telequebec.tv/v1/videos/${videoId}`, videoId);
    const mediaId = String(video.sourceId);
    return {
      _type: 'url_transparent',
      url: `http://zonevideo.telequebec.tv/media/${mediaId}`,
      ie_key: 'TeleQuebec',
      id: mediaId,
      title: video.titre as string | undefined,
      description: video.description as string | undefined,
      timestamp: unified_timestamp(video.datePublication) ?? undefined,
      series: video.container as string | undefined,
      season: video.saison as string | undefined,
      season_number: int_or_none(video.noSaison) ?? undefined,
      episode_number: int_or_none(video.episode) ?? undefined,
    };
  }
}

export class TeleQuebecEmissionIE extends InfoExtractor {
  static IE_NAME = 'telequebec:emission';
  static _VALID_URL =
    /https?:\/\/(?:(?:[^/]+\.)?telequebec\.tv\/emissions\/|(?:www\.)?telequebec\.tv\/)(?<id>[^?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const mediaId = this._search_regex(/mediaId\s*:\s*(?<id>\d+)/, webpage, 'media id');
    return this.url_result(`http://zonevideo.telequebec.tv/media/${mediaId}`, 'TeleQuebec');
  }
}

export class TeleQuebecLiveIE extends TeleQuebecBaseIE {
  static IE_NAME = 'telequebec:live';
  static _VALID_URL = /https?:\/\/zonevideo\.telequebec\.tv\/(?<id>endirect)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    return this._brightcoveResult('6159095684001', 'skCsmi2Uw');
  }
}

export class TeleQuebecVideoIE extends TeleQuebecBaseIE {
  static IE_NAME = 'telequebec:video';
  static _VALID_URL = /https?:\/\/video\.telequebec\.tv\/player(?:-live)?\/(?<id>\d+)/;

  protected async _callApi(path: string, videoId: string): Promise<Record<string, unknown>> {
    return (
      await this._download_json<{ data?: Record<string, unknown> }>(
        `http://beacon.playback.api.brightcove.com/telequebec/api/assets/${path}`,
        videoId,
        undefined,
        { query: { device_layout: 'web', device_type: 'web' } },
      )
    ).data!;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const assetId = this._match_id(url);
    const assetWrap = await this._callApi(assetId, assetId);
    const asset = assetWrap.asset as Record<string, unknown>;
    const streamId = (asset.streams as Array<{ id?: string }>)?.[0]?.id!;
    const stream = (await this._callApi(`${assetId}/streams/${streamId}`, assetId)).stream as Record<string, unknown>;
    const streamUrl = String(stream.url);
    const accountId =
      try_get(stream, (x) => (x.video_provider_details as { account_id?: string })?.account_id) || '6101674910001';
    const info = this._brightcoveResult(streamUrl, 'default', String(accountId));
    Object.assign(info, {
      description: (asset.long_description || asset.short_description) as string | undefined,
      series: asset.series_original_name as string | undefined,
      season_number: int_or_none(asset.season_number) ?? undefined,
      episode: asset.original_name as string | undefined,
      episode_number: int_or_none(asset.episode_number) ?? undefined,
    });
    return info;
  }
}
